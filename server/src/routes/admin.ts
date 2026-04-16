import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/db.js";
import { requireAdmin, requireAuth, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

// 초대키 목록
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
      expiresAt: d.expiresInDays
        ? new Date(Date.now() + d.expiresInDays * 86400000)
        : null,
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

// 유저 목록
router.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({
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

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      team: true,
      position: true,
      active: true,
    },
  });
  await writeLog(u.id, "USER_UPDATE", req.params.id, JSON.stringify(parsed.data));
  res.json({ user: updated });
});

router.delete("/users/:id", async (req, res) => {
  const u = (req as any).user;
  if (req.params.id === u.id) return res.status(400).json({ error: "본인은 삭제할 수 없습니다" });
  await prisma.user.delete({ where: { id: req.params.id } });
  await writeLog(u.id, "USER_DELETE", req.params.id);
  res.json({ ok: true });
});

// 로그
router.get("/logs", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
  res.json({ logs });
});

export default router;
