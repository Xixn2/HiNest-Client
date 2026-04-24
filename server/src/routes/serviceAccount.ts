import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

/**
 * 서비스 계정 레지스트리 — AWS/Vercel/GitHub 등 외부 서비스의 "누가 어떤 계정을 쓰는지" 기록.
 *
 * 보안 원칙:
 * - 비밀번호/액세스키/토큰은 저장하지 않는다. 어디까지나 "어떤 서비스에 어떤 로그인 ID 로,
 *   누가 담당하는지" 찾기 위한 인덱스. 실제 크레덴셜은 1Password/Bitwarden 같은 전용 도구에 둔다.
 * - `notes` 필드에도 비밀번호는 쓰지 말 것 — 경고 문구는 클라에서 노출.
 *
 * 권한:
 * - 로그인한 사용자는 전체 목록 열람 가능 (팀이 공유 자원으로 쓰는 전제).
 * - 생성/수정/삭제는 작성자(createdById) 본인 또는 ADMIN/SUPER 만.
 */

const router = Router();
router.use(requireAuth);

const CATEGORIES = [
  "CLOUD",      // AWS / GCP / Azure
  "HOSTING",    // Vercel / Netlify / Render
  "VCS",        // GitHub / GitLab
  "PAYMENT",    // Stripe / Toss
  "DOMAIN",     // 가비아 / Cloudflare
  "EMAIL",      // Google Workspace / Resend
  "MONITOR",    // Sentry / Datadog
  "DB",         // Supabase / Planetscale
  "AI",         // OpenAI / Anthropic
  "TESTING",    // BrowserStack / 테스트 계정
  "OTHER",
] as const;

const baseSchema = z.object({
  serviceName: z.string().trim().min(1).max(80),
  category: z.enum(CATEGORIES).optional().default("OTHER"),
  loginId: z.string().trim().max(200).optional().nullable(),
  url: z.string().trim().url().max(500).optional().nullable().or(z.literal("")),
  notes: z.string().max(2000).optional().nullable(),
  ownerUserId: z.string().optional().nullable(),
  ownerName: z.string().trim().max(80).optional().nullable(),
});

const createSchema = baseSchema;
const updateSchema = baseSchema.partial();

function canEdit(user: { id: string; role?: string; superAdmin?: boolean }, row: { createdById: string }) {
  return user.superAdmin || user.role === "ADMIN" || row.createdById === user.id;
}

/** 목록 — 카테고리 필터와 검색 지원. */
router.get("/", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  const where: any = {};
  if (category && (CATEGORIES as readonly string[]).includes(category)) {
    where.category = category;
  }
  if (q) {
    where.OR = [
      { serviceName: { contains: q, mode: "insensitive" } },
      { loginId: { contains: q, mode: "insensitive" } },
      { ownerName: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.serviceAccount.findMany({
    where,
    orderBy: [{ category: "asc" }, { serviceName: "asc" }],
    include: {
      ownerUser: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, email: true, team: true, position: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  res.json({ accounts: rows });
});

router.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "잘못된 요청" });
  }
  const input = parsed.data;
  const userId = (req as any).user.id as string;

  // URL 빈 문자열은 null 로 정규화 (zod 의 literal("") 을 통과한 경우)
  const url = input.url === "" ? null : input.url ?? null;

  // ownerUserId 가 실존 유저인지 검증 — 빈 문자열은 null 로
  let ownerUserId = input.ownerUserId || null;
  if (ownerUserId) {
    const exists = await prisma.user.findUnique({ where: { id: ownerUserId }, select: { id: true } });
    if (!exists) return res.status(400).json({ error: "담당자로 지정한 사용자를 찾을 수 없어요." });
  }

  const row = await prisma.serviceAccount.create({
    data: {
      serviceName: input.serviceName,
      category: input.category ?? "OTHER",
      loginId: input.loginId || null,
      url,
      notes: input.notes || null,
      ownerUserId,
      ownerName: input.ownerName || null,
      createdById: userId,
    },
    include: {
      ownerUser: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, email: true, team: true, position: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  res.json({ account: row });
});

router.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "잘못된 요청" });
  }
  const user = (req as any).user as { id: string; role?: string; superAdmin?: boolean };
  const id = req.params.id;

  const existing = await prisma.serviceAccount.findUnique({ where: { id }, select: { id: true, createdById: true } });
  if (!existing) return res.status(404).json({ error: "존재하지 않는 계정이에요." });
  if (!canEdit(user, existing)) {
    return res.status(403).json({ error: "이 계정을 수정할 권한이 없어요." });
  }

  const input = parsed.data;
  const data: any = {};
  if (input.serviceName !== undefined) data.serviceName = input.serviceName;
  if (input.category !== undefined) data.category = input.category;
  if (input.loginId !== undefined) data.loginId = input.loginId || null;
  if (input.url !== undefined) data.url = input.url === "" ? null : input.url;
  if (input.notes !== undefined) data.notes = input.notes || null;
  if (input.ownerName !== undefined) data.ownerName = input.ownerName || null;
  if (input.ownerUserId !== undefined) {
    const next = input.ownerUserId || null;
    if (next) {
      const exists = await prisma.user.findUnique({ where: { id: next }, select: { id: true } });
      if (!exists) return res.status(400).json({ error: "담당자로 지정한 사용자를 찾을 수 없어요." });
    }
    data.ownerUserId = next;
  }

  const row = await prisma.serviceAccount.update({
    where: { id },
    data,
    include: {
      ownerUser: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, email: true, team: true, position: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  res.json({ account: row });
});

router.delete("/:id", async (req, res) => {
  const user = (req as any).user as { id: string; role?: string; superAdmin?: boolean };
  const existing = await prisma.serviceAccount.findUnique({ where: { id: req.params.id }, select: { id: true, createdById: true } });
  if (!existing) return res.status(404).json({ error: "존재하지 않는 계정이에요." });
  if (!canEdit(user, existing)) {
    return res.status(403).json({ error: "이 계정을 삭제할 권한이 없어요." });
  }
  await prisma.serviceAccount.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

export default router;
