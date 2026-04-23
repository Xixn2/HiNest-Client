import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

/**
 * 회의록 — 노션 스타일 리치 텍스트(JSON) 저장.
 * 공개 범위:
 *   ALL       전사
 *   PROJECT   해당 프로젝트 멤버
 *   SPECIFIC  viewers 에 명시된 유저 + 작성자
 * 작성자는 항상 열람·수정 가능, ADMIN 은 전역 열람.
 */

const VIS = ["ALL", "PROJECT", "SPECIFIC"] as const;

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.any(), // TipTap JSON document
  visibility: z.enum(VIS).default("ALL"),
  // CUID/UUID 길이는 36자 이내. 50자면 여유 있음.
  projectId: z.string().max(50).optional().nullable(),
  // 지정 열람자 최대 200명 — 특정 대상 회의록 자리의 합리적 상한.
  viewerIds: z.array(z.string().max(50)).max(200).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.any().optional(),
  visibility: z.enum(VIS).optional(),
  projectId: z.string().max(50).optional().nullable(),
  viewerIds: z.array(z.string().max(50)).max(200).optional(),
});

// content 는 TipTap JSON 이라 길이가 천차만별. 이미지 다수/긴 표 섞여도 보통 수백 KB
// 안쪽이라 512KB 면 충분. 전역 json limit(2MB) 보다 타이트하게 컷해야 Postgres JSONB
// 파싱/인덱싱 비용이 튀지 않고, 단일 문서 열람 속도도 예측 가능.
const MEETING_CONTENT_MAX = 512_000;
function sizeOfJson(v: unknown): number {
  try {
    return JSON.stringify(v ?? "").length;
  } catch {
    // 순환 참조 등은 어차피 prisma 쪽에서도 터지니 큰 값으로 밀어 버림.
    return Number.MAX_SAFE_INTEGER;
  }
}

/** 내가 읽을 수 있는 회의록 목록. */
router.get("/", async (req, res) => {
  const u = (req as any).user;
  const isAdmin = u.role === "ADMIN";
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;

  // ADMIN 은 전체. 일반 유저는 (ALL) ∪ (PROJECT 내가 멤버인 프로젝트) ∪ (SPECIFIC viewer 포함) ∪ (내가 작성).
  const myProjects = await prisma.projectMember.findMany({
    where: { userId: u.id },
    select: { projectId: true },
  });
  const myProjectIds = myProjects.map((m) => m.projectId);

  const where: any = isAdmin
    ? {}
    : {
        OR: [
          { visibility: "ALL" },
          { visibility: "PROJECT", projectId: { in: myProjectIds.length ? myProjectIds : ["__none__"] } },
          { visibility: "SPECIFIC", viewers: { some: { userId: u.id } } },
          { authorId: u.id },
        ],
      };

  if (projectId) {
    where.projectId = projectId;
  }

  const meetings = await prisma.meeting.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      title: true,
      visibility: true,
      projectId: true,
      authorId: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      project: { select: { id: true, name: true, color: true } },
    },
  });
  res.json({ meetings });
});

async function canRead(meeting: any, userId: string, userRole: string) {
  if (userRole === "ADMIN") return true;
  if (meeting.authorId === userId) return true;
  if (meeting.visibility === "ALL") return true;
  if (meeting.visibility === "PROJECT" && meeting.projectId) {
    const m = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: meeting.projectId, userId } },
    });
    return !!m;
  }
  if (meeting.visibility === "SPECIFIC") {
    const v = await prisma.meetingViewer.findUnique({
      where: { meetingId_userId: { meetingId: meeting.id, userId } },
    });
    return !!v;
  }
  return false;
}

router.get("/:id", async (req, res) => {
  const u = (req as any).user;
  const meeting = await prisma.meeting.findUnique({
    where: { id: req.params.id },
    include: {
      author: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      project: { select: { id: true, name: true, color: true } },
      viewers: {
        include: { user: { select: { id: true, name: true, team: true, position: true, avatarColor: true, avatarUrl: true } } },
      },
    },
  });
  if (!meeting) return res.status(404).json({ error: "not found" });
  const ok = await canRead(meeting, u.id, u.role);
  if (!ok) return res.status(403).json({ error: "forbidden" });
  res.json({ meeting });
});

router.post("/", async (req, res) => {
  const u = (req as any).user;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d = parsed.data;

  if (sizeOfJson(d.content) > MEETING_CONTENT_MAX) {
    return res.status(413).json({ error: "회의록 본문이 너무 깁니다 (512KB 초과)" });
  }

  // PROJECT 범위면 해당 프로젝트에 내가 속해있거나 ADMIN 이어야 함.
  if (d.visibility === "PROJECT") {
    if (!d.projectId) return res.status(400).json({ error: "projectId required for PROJECT visibility" });
    if (u.role !== "ADMIN") {
      const m = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: d.projectId, userId: u.id } },
      });
      if (!m) return res.status(403).json({ error: "not a project member" });
    }
  }

  const meeting = await prisma.meeting.create({
    data: {
      title: d.title,
      content: d.content ?? {},
      visibility: d.visibility,
      projectId: d.visibility === "PROJECT" ? d.projectId ?? null : null,
      authorId: u.id,
      viewers:
        d.visibility === "SPECIFIC" && d.viewerIds?.length
          ? {
              create: Array.from(new Set(d.viewerIds.filter((id) => id !== u.id))).map((userId) => ({
                userId,
              })),
            }
          : undefined,
    },
  });
  await writeLog(u.id, "MEETING_CREATE", meeting.id, d.title);
  res.json({ meeting });
});

router.patch("/:id", async (req, res) => {
  const u = (req as any).user;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const existing = await prisma.meeting.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "not found" });

  // 권한 모델:
  //   - 제목/본문 수정: 열람 권한이 있으면 누구나 가능 (회의록 협업 수정 목적).
  //   - 공개 범위(visibility / projectId / viewerIds) 변경: 작성자 또는 ADMIN 만.
  //     열람자가 SPECIFIC → ALL 로 풀어버리는 사고 방지.
  const isAuthor = existing.authorId === u.id;
  const isAdmin = u.role === "ADMIN";
  const canAccess = await canRead(existing, u.id, u.role);
  if (!canAccess) {
    return res.status(403).json({ error: "forbidden" });
  }
  const d = parsed.data;
  const changesVisibility =
    d.visibility !== undefined || d.projectId !== undefined || d.viewerIds !== undefined;
  if (changesVisibility && !(isAuthor || isAdmin)) {
    return res.status(403).json({ error: "공개 범위는 작성자 또는 관리자만 변경할 수 있어요" });
  }
  if (d.content !== undefined && sizeOfJson(d.content) > MEETING_CONTENT_MAX) {
    return res.status(413).json({ error: "회의록 본문이 너무 깁니다 (512KB 초과)" });
  }

  // visibility=SPECIFIC 으로 바뀌거나 이미 SPECIFIC 인데 viewerIds 를 다시 주면 교체.
  const replaceViewers =
    d.viewerIds !== undefined &&
    ((d.visibility ?? existing.visibility) === "SPECIFIC");

  const updated = await prisma.$transaction(async (tx) => {
    if (replaceViewers) {
      await tx.meetingViewer.deleteMany({ where: { meetingId: existing.id } });
      if (d.viewerIds && d.viewerIds.length) {
        await tx.meetingViewer.createMany({
          data: Array.from(new Set(d.viewerIds.filter((id) => id !== existing.authorId))).map((userId) => ({
            meetingId: existing.id,
            userId,
          })),
          skipDuplicates: true,
        });
      }
    }
    return tx.meeting.update({
      where: { id: existing.id },
      data: {
        title: d.title,
        content: d.content,
        visibility: d.visibility,
        projectId:
          d.visibility !== undefined
            ? d.visibility === "PROJECT"
              ? d.projectId ?? existing.projectId
              : null
            : d.projectId ?? undefined,
      },
    });
  });
  await writeLog(u.id, "MEETING_UPDATE", updated.id);
  res.json({ meeting: updated });
});

router.delete("/:id", async (req, res) => {
  const u = (req as any).user;
  const existing = await prisma.meeting.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "not found" });
  if (existing.authorId !== u.id && u.role !== "ADMIN") {
    return res.status(403).json({ error: "forbidden" });
  }
  await prisma.meeting.delete({ where: { id: existing.id } });
  await writeLog(u.id, "MEETING_DELETE", existing.id);
  res.json({ ok: true });
});

export default router;
