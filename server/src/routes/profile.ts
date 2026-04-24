import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

const schema = z.object({
  name: z.string().min(1).max(200).optional(),
  avatarColor: z.string().regex(/^#([0-9A-Fa-f]{6})$/).optional(),
  // 업로드 후 받은 /uploads/... 경로. "" 또는 null 을 보내면 삭제로 처리해 색상 fallback.
  // 경로 길이 상한 — /uploads/<uuid>.ext 정도라 500자면 충분.
  avatarUrl: z.string().max(500).nullable().optional(),
});

router.patch("/", async (req, res) => {
  const u = (req as any).user;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d: any = { ...parsed.data };
  // 빈 문자열은 명시적 제거로 해석
  if (d.avatarUrl === "") d.avatarUrl = null;
  // 업로드된 경로 외 외부 URL 은 막아둔다 (프로필 이미지 프록시 우회/SSRF 방지).
  if (typeof d.avatarUrl === "string" && !d.avatarUrl.startsWith("/uploads/")) {
    return res.status(400).json({ error: "유효하지 않은 이미지 경로입니다." });
  }
  const user = await prisma.user.update({
    where: { id: u.id },
    data: d,
    select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true, team: true, position: true, role: true },
  });
  await writeLog(u.id, "PROFILE_UPDATE", u.id, JSON.stringify(d));
  res.json({ user });
});

const pwSchema = z.object({
  current: z.string().min(1).max(200),
  // 8자 이상 — 가입 시 기준과 일치. 과거 6자 계정도 다음 변경 시 이 규칙을 따라 8자로 강제.
  // bcrypt 는 72바이트 초과분을 조용히 잘라내므로 128 자로 상한을 둬서 사용자에게 힌트를 강제.
  next: z.string().min(8).max(128),
});

// 비밀번호 변경은 current 검증에 의존하는 bruteforce 경로. 전역 apiLimiter(600/분)보다
// 훨씬 빡빡하게 — 동일 IP 기준 10분 10회로 제한.
const passwordChangeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "비밀번호 변경 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
});

router.post("/password", passwordChangeLimiter, async (req, res) => {
  const u = (req as any).user;
  const parsed = pwSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "새 비밀번호는 8자 이상" });
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  if (!user) return res.status(404).json({ error: "not found" });
  const ok = await bcrypt.compare(parsed.data.current, user.passwordHash);
  if (!ok) {
    await writeLog(u.id, "PASSWORD_CHANGE_FAIL", undefined, undefined, req.ip);
    return res.status(401).json({ error: "현재 비밀번호가 일치하지 않습니다" });
  }
  const hash = await bcrypt.hash(parsed.data.next, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  await writeLog(u.id, "PASSWORD_CHANGE", undefined, undefined, req.ip);
  res.json({ ok: true });
});

export default router;
