import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";
import { notifyMany } from "../lib/notify.js";

const router = Router();
router.use(requireAuth);

const CATEGORIES = [
  "MEETING",
  "DEADLINE",
  "OUT",
  "HOLIDAY",
  "EVENT",
  "BIRTHDAY",
  "TASK",
  "INTERVIEW",
  "TRAINING",
  "CLIENT",
  "SOCIAL",
  "HEALTH",
  "PERSONAL_C",
  "COMPANY_HOLIDAY",
  "COMPANY_LEAVE",
  "OTHER",
] as const;

const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  MEETING: "회의",
  DEADLINE: "마감",
  OUT: "외근·출장",
  HOLIDAY: "휴가",
  EVENT: "사내행사",
  BIRTHDAY: "기념일",
  TASK: "업무",
  INTERVIEW: "면접",
  TRAINING: "교육·워크샵",
  CLIENT: "고객·미팅",
  SOCIAL: "회식·모임",
  HEALTH: "건강·병원",
  PERSONAL_C: "개인일정",
  COMPANY_HOLIDAY: "사내 휴일",
  COMPANY_LEAVE: "전사 휴가",
  OTHER: "일반",
};

const ADMIN_ONLY_CATEGORIES = new Set(["COMPANY_HOLIDAY", "COMPANY_LEAVE"]);

/**
 * 일정 목록.
 * 공유 규칙:
 *  - COMPANY   → 모두 열람
 *  - TEAM      → 같은 team 에 속한 유저만 열람
 *  - PERSONAL  → 본인만 열람
 *  - TARGETED  → 지정된 targetUserIds 에 포함되거나 본인이 만든 일정만 열람
 */
router.get("/", async (req, res) => {
  const u = (req as any).user;
  const meUser = await prisma.user.findUnique({ where: { id: u.id } });
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;

  const where: any = {
    OR: [
      { scope: "COMPANY" },
      { scope: "TEAM", team: meUser?.team ?? "" },
      { scope: "PERSONAL", createdBy: u.id },
      { scope: "TARGETED", createdBy: u.id },
      { scope: "TARGETED", targetUserIds: { contains: u.id } },
    ],
  };
  if (from || to) {
    where.AND = [];
    if (from) where.AND.push({ endAt: { gte: from } });
    if (to) where.AND.push({ startAt: { lte: to } });
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startAt: "asc" },
    include: { author: { select: { name: true, avatarColor: true, avatarUrl: true } } },
  });
  res.json({ events });
});

const eventSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  scope: z.enum(["COMPANY", "TEAM", "PERSONAL", "TARGETED"]).default("PERSONAL"),
  team: z.string().optional().nullable(),
  category: z.enum(CATEGORIES).default("OTHER"),
  targetUserIds: z.array(z.string()).optional(),
  startAt: z.string(),
  endAt: z.string(),
  color: z.string().optional(),
});

router.post("/", async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const d = parsed.data;

  if (d.scope === "COMPANY" && u.role === "MEMBER")
    return res.status(403).json({ error: "전사 일정은 관리자/매니저만 등록 가능" });

  if (ADMIN_ONLY_CATEGORIES.has(d.category) && u.role === "MEMBER")
    return res.status(403).json({ error: "해당 카테고리는 관리자/매니저만 등록 가능" });

  const me = await prisma.user.findUnique({ where: { id: u.id } });

  const targets = (d.targetUserIds ?? []).filter((id) => id && id !== u.id);

  const ev = await prisma.event.create({
    data: {
      title: d.title,
      content: d.content,
      scope: d.scope,
      team: d.scope === "TEAM" ? (d.team ?? me?.team ?? null) : (d.team ?? null),
      category: d.category,
      targetUserIds: targets.length ? targets.join(",") : null,
      startAt: new Date(d.startAt),
      endAt: new Date(d.endAt),
      color: d.color ?? "#3B5CF0",
      createdBy: u.id,
    },
  });
  await writeLog(u.id, "EVENT_CREATE", ev.id, `${d.category}:${d.title}`);

  // 알림 대상 산정
  //  - COMPANY : 전원(본인 제외)
  //  - TEAM    : 같은 팀원(본인 제외)
  //  - TARGETED: 지정된 유저 + (선택) 본인 제외
  //  - PERSONAL: 없음
  let recipientIds: string[] = [];
  if (d.scope === "COMPANY") {
    const users = await prisma.user.findMany({
      where: { active: true, id: { not: u.id }, superAdmin: false },
      select: { id: true },
    });
    recipientIds = users.map((x) => x.id);
  } else if (d.scope === "TEAM") {
    const team = d.team ?? me?.team;
    if (team) {
      const users = await prisma.user.findMany({
        where: { active: true, team, id: { not: u.id } },
        select: { id: true },
      });
      recipientIds = users.map((x) => x.id);
    }
  } else if (d.scope === "TARGETED") {
    recipientIds = targets;
  }

  if (recipientIds.length) {
    const when = new Date(d.startAt).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const scopeLabel =
      d.scope === "COMPANY"
        ? "전사 일정"
        : d.scope === "TEAM"
        ? `${d.team ?? me?.team ?? "팀"} 팀 일정`
        : "새 일정 태그";
    const categoryLabel = CATEGORY_LABEL[d.category];

    await notifyMany(
      recipientIds.map((rid) => ({
        userId: rid,
        type: d.scope === "TARGETED" ? ("MENTION" as const) : ("SYSTEM" as const),
        title: `${scopeLabel} · ${categoryLabel}`,
        body: `${u.name} · ${when}\n${d.title}`,
        linkUrl: `/schedule`,
        actorName: u.name,
      }))
    );
  }

  res.json({ event: ev });
});

router.delete("/:id", async (req, res) => {
  const u = (req as any).user;
  const ev = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!ev) return res.status(404).json({ error: "not found" });
  if (ev.createdBy !== u.id && u.role !== "ADMIN")
    return res.status(403).json({ error: "forbidden" });
  await prisma.event.delete({ where: { id: ev.id } });
  await writeLog(u.id, "EVENT_DELETE", ev.id);
  res.json({ ok: true });
});

export default router;
