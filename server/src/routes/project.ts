import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";
import { generateWebhookToken } from "./webhook.js";

const router = Router();
router.use(requireAuth);

/**
 * 내가 참여중인 프로젝트 목록.
 * - 사이드바 "팀" 섹션에서 쓰기 위해 가볍게 반환.
 * - ADMIN 은 전체 프로젝트를 볼 수 있게 옵션(all=1) 지원.
 */
router.get("/", async (req, res) => {
  const u = (req as any).user;
  const all = req.query.all === "1" && u.role === "ADMIN";
  const where = all ? {} : { members: { some: { userId: u.id } } };
  const list = await prisma.project.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { members: true } },
    },
  });
  res.json({ projects: list });
});

router.get("/:id", async (req, res) => {
  const u = (req as any).user;
  const p = await prisma.project.findUnique({
    where: { id: req.params.id },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, team: true, position: true, avatarColor: true, avatarUrl: true } } },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!p) return res.status(404).json({ error: "not found" });
  // 멤버가 아니면 조회 불가 (ADMIN 제외)
  const isMember = p.members.some((m) => m.userId === u.id);
  if (!isMember && u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  res.json({ project: p });
});

const createSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  color: z.string().max(16).optional(),
  memberIds: z.array(z.string()).optional(),
});

router.post("/", async (req, res) => {
  const u = (req as any).user;
  // 프로젝트 생성은 ADMIN 만 — 일반 유저는 멤버로 초대받아 참여한다.
  if (u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d = parsed.data;
  // 생성자는 OWNER 로 자동 포함. 중복 제거.
  const memberSet = new Set<string>([u.id, ...(d.memberIds ?? [])]);
  const project = await prisma.project.create({
    data: {
      name: d.name,
      description: d.description ?? null,
      color: d.color ?? "#3B5CF0",
      createdById: u.id,
      members: {
        create: Array.from(memberSet).map((uid) => ({
          userId: uid,
          role: uid === u.id ? "OWNER" : "MEMBER",
        })),
      },
    },
    include: { _count: { select: { members: true } } },
  });
  await writeLog(u.id, "PROJECT_CREATE", project.id, d.name);
  res.json({ project });
});

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  color: z.string().max(16).optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
});

router.patch("/:id", async (req, res) => {
  const u = (req as any).user;
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: req.params.id, userId: u.id } },
  });
  if (!m && u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  if (m && m.role === "MEMBER" && u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  const p = await prisma.project.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  await writeLog(u.id, "PROJECT_UPDATE", p.id);
  res.json({ project: p });
});

router.delete("/:id", async (req, res) => {
  const u = (req as any).user;
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: req.params.id, userId: u.id } },
  });
  if (!m && u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  if (m && m.role !== "OWNER" && u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  await prisma.project.delete({ where: { id: req.params.id } });
  await writeLog(u.id, "PROJECT_DELETE", req.params.id);
  res.json({ ok: true });
});

/* ---------------- 프로젝트 일정 ---------------- */

async function assertProjectMember(projectId: string, userId: string, adminRole: string) {
  if (adminRole === "ADMIN") return true;
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return !!m;
}

/** 범위 내 프로젝트 이벤트 조회. from/to 는 ISO. */
router.get("/:id/events", async (req, res) => {
  const u = (req as any).user;
  const ok = await assertProjectMember(req.params.id, u.id, u.role);
  if (!ok) return res.status(403).json({ error: "forbidden" });
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const where: any = { projectId: req.params.id };
  if (from && to) {
    // 구간 겹침: startAt <= to AND endAt >= from
    where.AND = [{ startAt: { lte: to } }, { endAt: { gte: from } }];
  }
  // take 상한 — 한 달 이벤트가 수천 건씩 쌓인 프로젝트에서 달력이 응답을 못 받아 비는 현상 방지.
  const events = await prisma.projectEvent.findMany({
    where,
    orderBy: { startAt: "asc" },
    take: 2000,
  });
  res.json({ events });
});

// PATCH 에서 .partial() 을 쓸 수 있도록 base 는 ZodObject 로 유지하고, refine 은 별도 변형만 export.
const eventSchemaBase = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).optional().nullable(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  allDay: z.boolean().optional(),
  color: z.string().max(16).optional(),
  // 담당자 수 상한 — 한 이벤트에 50명 이상은 현실적으로 없고, 지나치면 assigneeIds
  // 콤마 직렬화가 너무 길어져 DB 필드 / 목록 렌더링이 무거워짐.
  assigneeIds: z.array(z.string().max(64)).max(50).optional(),
  // 완료 토글 — 전체 수정 모달에서는 안 쓰이지만 PATCH 에서 같이 보낼 수 있게 허용.
  completed: z.boolean().optional(),
});
const eventSchema = eventSchemaBase.refine(
  (d) => new Date(d.endAt).getTime() >= new Date(d.startAt).getTime(),
  { message: "종료 시각이 시작 시각보다 빠릅니다", path: ["endAt"] },
);
// PATCH 는 일부 필드만 올 수 있으므로 둘 다 있을 때만 순서 검증.
const eventPatchSchema = eventSchemaBase.partial().refine(
  (d) => !d.startAt || !d.endAt || new Date(d.endAt).getTime() >= new Date(d.startAt).getTime(),
  { message: "종료 시각이 시작 시각보다 빠릅니다", path: ["endAt"] },
);

/** 담당자 userId 들이 모두 해당 프로젝트 멤버인지 검증하고 콤마 문자열로 직렬화. */
async function normalizeAssignees(projectId: string, ids: string[] | undefined): Promise<string | null> {
  if (!ids || ids.length === 0) return null;
  const unique = Array.from(new Set(ids));
  const members = await prisma.projectMember.findMany({
    where: { projectId, userId: { in: unique } },
    select: { userId: true },
  });
  const valid = new Set(members.map((m) => m.userId));
  const filtered = unique.filter((id) => valid.has(id));
  return filtered.length ? filtered.join(",") : null;
}

router.post("/:id/events", async (req, res) => {
  const u = (req as any).user;
  const ok = await assertProjectMember(req.params.id, u.id, u.role);
  if (!ok) return res.status(403).json({ error: "forbidden" });
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d = parsed.data;
  const assigneeIds = await normalizeAssignees(req.params.id, d.assigneeIds);
  const ev = await prisma.projectEvent.create({
    data: {
      projectId: req.params.id,
      title: d.title,
      description: d.description ?? null,
      startAt: new Date(d.startAt),
      endAt: new Date(d.endAt),
      allDay: !!d.allDay,
      color: d.color ?? "#3B5CF0",
      assigneeIds,
      createdById: u.id,
    },
  });
  res.json({ event: ev });
});

router.patch("/:id/events/:eventId", async (req, res) => {
  const u = (req as any).user;
  const ok = await assertProjectMember(req.params.id, u.id, u.role);
  if (!ok) return res.status(403).json({ error: "forbidden" });
  const parsed = eventPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d = parsed.data;
  // 완료 상태 전환 시 누가 언제 완료했는지 자동으로 스탬프. 되돌릴 때는 초기화.
  const completedPatch =
    "completed" in d
      ? d.completed
        ? { completed: true, completedAt: new Date(), completedById: u.id }
        : { completed: false, completedAt: null, completedById: null }
      : {};
  const ev = await prisma.projectEvent.update({
    where: { id: req.params.eventId },
    data: {
      ...("title" in d ? { title: d.title! } : {}),
      ...("description" in d ? { description: d.description ?? null } : {}),
      ...("startAt" in d ? { startAt: new Date(d.startAt!) } : {}),
      ...("endAt" in d ? { endAt: new Date(d.endAt!) } : {}),
      ...("allDay" in d ? { allDay: !!d.allDay } : {}),
      ...("color" in d ? { color: d.color! } : {}),
      ...("assigneeIds" in d ? { assigneeIds: await normalizeAssignees(req.params.id, d.assigneeIds) } : {}),
      ...completedPatch,
    },
  });
  res.json({ event: ev });
});

router.delete("/:id/events/:eventId", async (req, res) => {
  const u = (req as any).user;
  const ok = await assertProjectMember(req.params.id, u.id, u.role);
  if (!ok) return res.status(403).json({ error: "forbidden" });
  await prisma.projectEvent.delete({ where: { id: req.params.eventId } });
  res.json({ ok: true });
});

/* ---------------- 웹훅 채널 ---------------- */

/** 프로젝트의 웹훅 채널 목록. 최근 이벤트 카운트 포함. */
router.get("/:id/webhook", async (req, res) => {
  const u = (req as any).user;
  const ok = await assertProjectMember(req.params.id, u.id, u.role);
  if (!ok) return res.status(403).json({ error: "forbidden" });
  // take 상한 — 한 프로젝트에 수백 개 webhook 을 만들 일은 실무상 없으므로 100 으로 충분.
  const channels = await prisma.webhookChannel.findMany({
    where: { projectId: req.params.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { events: true } } },
    take: 100,
  });
  res.json({ channels });
});

const chCreateSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(500).optional(),
  color: z.string().max(16).optional(),
});

router.post("/:id/webhook", async (req, res) => {
  const u = (req as any).user;
  const ok = await assertProjectMember(req.params.id, u.id, u.role);
  if (!ok) return res.status(403).json({ error: "forbidden" });
  const parsed = chCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const ch = await prisma.webhookChannel.create({
    data: {
      projectId: req.params.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      color: parsed.data.color ?? "#6366F1",
      token: generateWebhookToken(),
      createdById: u.id,
    },
  });
  await writeLog(u.id, "WEBHOOK_CHANNEL_CREATE", ch.id, parsed.data.name);
  res.json({ channel: ch });
});

router.delete("/:id/webhook/:channelId", async (req, res) => {
  const u = (req as any).user;
  const ok = await assertProjectMember(req.params.id, u.id, u.role);
  if (!ok) return res.status(403).json({ error: "forbidden" });
  await prisma.webhookChannel.delete({ where: { id: req.params.channelId } });
  res.json({ ok: true });
});

/** token rotate — 기존 URL 무효화, 새 URL 로 교체. */
router.post("/:id/webhook/:channelId/rotate", async (req, res) => {
  const u = (req as any).user;
  const ok = await assertProjectMember(req.params.id, u.id, u.role);
  if (!ok) return res.status(403).json({ error: "forbidden" });
  const ch = await prisma.webhookChannel.update({
    where: { id: req.params.channelId },
    data: { token: generateWebhookToken() },
  });
  res.json({ channel: ch });
});

/** 채널별 수신 이벤트 피드 (최근순). */
router.get("/:id/webhook/:channelId/events", async (req, res) => {
  const u = (req as any).user;
  const ok = await assertProjectMember(req.params.id, u.id, u.role);
  if (!ok) return res.status(403).json({ error: "forbidden" });
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  const events = await prisma.webhookEvent.findMany({
    where: { channelId: req.params.channelId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({ events });
});

/** 멤버 추가 — OWNER/MANAGER 만. OWNER 승격은 기존 OWNER 또는 ADMIN 만 가능. */
router.post("/:id/member", async (req, res) => {
  const u = (req as any).user;
  const body = z.object({ userId: z.string(), role: z.enum(["OWNER", "MANAGER", "MEMBER"]).optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "invalid input" });
  const me = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: req.params.id, userId: u.id } },
  });
  if (!me && u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  if (me && me.role === "MEMBER" && u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  // OWNER 부여 권한 체크 — MANAGER 가 임의로 OWNER 를 만드는 것을 막는다.
  // 프로젝트 삭제 권한(line 112 부근) 이 OWNER 한 명만 갖는 구조라 OWNER 수를 엄격히 통제해야 함.
  const targetRole = body.data.role ?? "MEMBER";
  if (targetRole === "OWNER" && !(me?.role === "OWNER" || u.role === "ADMIN")) {
    return res.status(403).json({ error: "OWNER 역할은 기존 OWNER 또는 시스템 관리자만 부여할 수 있어요" });
  }
  const created = await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: req.params.id, userId: body.data.userId } },
    update: { role: targetRole },
    create: { projectId: req.params.id, userId: body.data.userId, role: targetRole },
  });
  res.json({ member: created });
});

/** 멤버 제거 — OWNER/MANAGER 만, 본인은 자진 탈퇴 가능. */
router.delete("/:id/member/:userId", async (req, res) => {
  const u = (req as any).user;
  const me = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: req.params.id, userId: u.id } },
  });
  const isSelf = req.params.userId === u.id;
  if (!me && u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  if (!isSelf && me && me.role === "MEMBER" && u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  await prisma.projectMember.delete({
    where: { projectId_userId: { projectId: req.params.id, userId: req.params.userId } },
  });
  res.json({ ok: true });
});

export default router;
