import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

const schema = z.object({
  name: z.string().min(1).optional(),
  avatarColor: z.string().regex(/^#([0-9A-Fa-f]{6})$/).optional(),
});

router.patch("/", async (req, res) => {
  const u = (req as any).user;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d = parsed.data;
  const user = await prisma.user.update({
    where: { id: u.id },
    data: d,
    select: { id: true, name: true, email: true, avatarColor: true, team: true, position: true, role: true },
  });
  await writeLog(u.id, "PROFILE_UPDATE", u.id, JSON.stringify(d));
  res.json({ user });
});

const pwSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(6),
});

router.post("/password", async (req, res) => {
  const u = (req as any).user;
  const parsed = pwSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "새 비밀번호는 6자 이상" });
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  if (!user) return res.status(404).json({ error: "not found" });
  const ok = await bcrypt.compare(parsed.data.current, user.passwordHash);
  if (!ok) {
    await writeLog(u.id, "PASSWORD_CHANGE_FAIL", undefined, undefined, req.ip);
    return res.status(401).json({ error: "현재 비밀번호가 일치하지 않습니다" });
  }
  const hash = await bcrypt.hash(parsed.data.next, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  await writeLog(u.id, "PASSWORD_CHANGE", undefined, undefined, req.ip);
  res.json({ ok: true });
});

export default router;
