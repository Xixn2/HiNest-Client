import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { signToken, setAuthCookie, clearAuthCookie, writeLog } from "../lib/auth.js";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return res.status(401).json({ error: "잘못된 이메일 또는 비밀번호" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "잘못된 이메일 또는 비밀번호" });

  const token = signToken({ id: user.id, role: user.role, name: user.name, email: user.email });
  setAuthCookie(res, token);
  await writeLog(user.id, "LOGIN", user.email, undefined, req.ip);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      team: user.team,
      position: user.position,
      avatarColor: user.avatarColor,
    },
  });
});

const signupSchema = z.object({
  inviteKey: z.string().min(4),
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(6),
});

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "입력값을 확인해주세요 (비밀번호는 6자 이상)" });
  const { inviteKey, email, name, password } = parsed.data;

  const key = await prisma.inviteKey.findUnique({ where: { key: inviteKey } });
  if (!key) return res.status(400).json({ error: "유효하지 않은 초대키" });
  if (key.used) return res.status(400).json({ error: "이미 사용된 초대키" });
  if (key.expiresAt && key.expiresAt < new Date()) return res.status(400).json({ error: "만료된 초대키" });
  if (key.email && key.email.toLowerCase() !== email.toLowerCase())
    return res.status(400).json({ error: "초대키에 등록된 이메일과 일치하지 않습니다" });

  const dup = await prisma.user.findUnique({ where: { email } });
  if (dup) return res.status(400).json({ error: "이미 가입된 이메일" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: key.role,
      team: key.team,
      position: key.position,
    },
  });

  await prisma.inviteKey.update({
    where: { id: key.id },
    data: { used: true, usedAt: new Date(), usedById: user.id },
  });

  const token = signToken({ id: user.id, role: user.role, name: user.name, email: user.email });
  setAuthCookie(res, token);
  await writeLog(user.id, "SIGNUP", user.email, `invite:${inviteKey}`, req.ip);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      team: user.team,
      position: user.position,
      avatarColor: user.avatarColor,
    },
  });
});

router.post("/logout", async (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

export default router;
