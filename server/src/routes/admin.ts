import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/db.js";
import { requireAdmin, requireAuth, requireSuperAdmin, requireSuperAdminStepUp, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

/* ===== 초대키 ===== */
router.get("/invites", async (_req, res) => {
  const keys = await prisma.inviteKey.findMany({
    orderBy: { createdAt: "desc" },
    include: { usedBy: { select: { name: true, email: true } } },
  });
  res.json({ keys });
});

const createKeySchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  name: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).default("MEMBER"),
  team: z.string().optional(),
  position: z.string().optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

router.post("/invites", async (req, res) => {
  const parsed = createKeySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d = parsed.data;
  const u = (req as any).user;

  const key = `HN-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;

  const created = await prisma.inviteKey.create({
    data: {
      key,
      email: d.email || null,
      name: d.name || null,
      role: d.role,
      team: d.team || null,
      position: d.position || null,
      expiresAt: d.expiresInDays ? new Date(Date.now() + d.expiresInDays * 86400000) : null,
      createdById: u.id,
    },
  });
  await writeLog(u.id, "INVITE_CREATE", key, JSON.stringify(d));
  res.json({ key: created });
});

router.delete("/invites/:id", async (req, res) => {
  const u = (req as any).user;
  await prisma.inviteKey.delete({ where: { id: req.params.id } });
  await writeLog(u.id, "INVITE_DELETE", req.params.id);
  res.json({ ok: true });
});

/* ===== 유저 ===== */
router.get("/users", async (req, res) => {
  const u = (req as any).user;
  const users = await prisma.user.findMany({
    where: u.superAdmin ? {} : { superAdmin: false }, // 일반 관리자에겐 총관리자 계정 은닉
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      team: true,
      position: true,
      active: true,
      avatarColor: true,
      createdAt: true,
      // superAdmin 필드는 의도적으로 반환하지 않음
    },
  });
  res.json({ users });
});

const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).optional(),
  team: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  active: z.boolean().optional(),
  name: z.string().optional(),
});

router.patch("/users/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;

  // 총관리자는 일반 관리자가 변경할 수 없음 — 404 처럼 위장해 존재를 노출하지 않음
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "not found" });
  if (target.superAdmin && !u.superAdmin) return res.status(404).json({ error: "not found" });

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: { id: true, email: true, name: true, role: true, team: true, position: true, active: true },
  });
  await writeLog(u.id, "USER_UPDATE", req.params.id, JSON.stringify(parsed.data));
  res.json({ user: updated });
});

router.delete("/users/:id", async (req, res) => {
  const u = (req as any).user;
  if (req.params.id === u.id) return res.status(400).json({ error: "본인은 삭제할 수 없습니다" });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "not found" });
  if (target.superAdmin && !u.superAdmin) return res.status(404).json({ error: "not found" });

  await prisma.user.delete({ where: { id: req.params.id } });
  await writeLog(u.id, "USER_DELETE", req.params.id);
  res.json({ ok: true });
});

/* ===== 팀 ===== */
router.get("/teams", async (_req, res) => {
  const teams = await prisma.team.findMany({ orderBy: { createdAt: "asc" } });
  res.json({ teams });
});

router.post("/teams", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "이름을 입력해주세요" });
  const u = (req as any).user;
  try {
    const team = await prisma.team.create({ data: { name } });
    await writeLog(u.id, "TEAM_CREATE", team.id, name);
    res.json({ team });
  } catch (e: any) {
    if (e?.code === "P2002") return res.status(400).json({ error: "이미 존재하는 팀" });
    throw e;
  }
});

router.patch("/teams/:id", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "이름을 입력해주세요" });
  const u = (req as any).user;
  const prev = await prisma.team.findUnique({ where: { id: req.params.id } });
  if (!prev) return res.status(404).json({ error: "not found" });
  const team = await prisma.team.update({ where: { id: prev.id }, data: { name } });
  // 사용자 team 문자열도 동기화
  if (prev.name !== name) {
    await prisma.user.updateMany({ where: { team: prev.name }, data: { team } });
  }
  await writeLog(u.id, "TEAM_UPDATE", team.id, `${prev.name} -> ${name}`);
  res.json({ team });
});

router.delete("/teams/:id", async (req, res) => {
  const u = (req as any).user;
  const team = await prisma.team.findUnique({ where: { id: req.params.id } });
  if (!team) return res.status(404).json({ error: "not found" });
  await prisma.team.delete({ where: { id: team.id } });
  await writeLog(u.id, "TEAM_DELETE", team.id, team.name);
  res.json({ ok: true });
});

/* ===== 직급 ===== */
router.get("/positions", async (_req, res) => {
  const positions = await prisma.position.findMany({ orderBy: [{ rank: "asc" }, { createdAt: "asc" }] });
  res.json({ positions });
});

router.post("/positions", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const rank = Number(req.body?.rank ?? 0);
  if (!name) return res.status(400).json({ error: "이름을 입력해주세요" });
  const u = (req as any).user;
  try {
    const position = await prisma.position.create({ data: { name, rank } });
    await writeLog(u.id, "POSITION_CREATE", position.id, name);
    res.json({ position });
  } catch (e: any) {
    if (e?.code === "P2002") return res.status(400).json({ error: "이미 존재하는 직급" });
    throw e;
  }
});

router.patch("/positions/:id", async (req, res) => {
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
  const rank = req.body?.rank !== undefined ? Number(req.body.rank) : undefined;
  const u = (req as any).user;
  const prev = await prisma.position.findUnique({ where: { id: req.params.id } });
  if (!prev) return res.status(404).json({ error: "not found" });
  const position = await prisma.position.update({
    where: { id: prev.id },
    data: { ...(name !== undefined && { name }), ...(rank !== undefined && { rank }) },
  });
  if (name && prev.name !== name) {
    await prisma.user.updateMany({ where: { position: prev.name }, data: { position: name } });
  }
  await writeLog(u.id, "POSITION_UPDATE", position.id, `${prev.name} -> ${name ?? prev.name}`);
  res.json({ position });
});

router.delete("/positions/:id", async (req, res) => {
  const u = (req as any).user;
  const position = await prisma.position.findUnique({ where: { id: req.params.id } });
  if (!position) return res.status(404).json({ error: "not found" });
  await prisma.position.delete({ where: { id: position.id } });
  await writeLog(u.id, "POSITION_DELETE", position.id, position.name);
  res.json({ ok: true });
});

/* ===== 로그 (총관리자 전용 · step-up 필요) ===== */
router.get("/logs", requireSuperAdminStepUp, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
  res.json({ logs });
});

export default router;
