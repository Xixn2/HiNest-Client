import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import {
  signToken,
  setAuthCookie,
  clearAuthCookie,
  writeLog,
  requireAuth,
  signSuper,
  setSuperCookie,
  clearSuperCookie,
  verifySuperToken,
  SUPER_TTL_SEC,
  requireSuperAdminStepUp,
} from "../lib/auth.js";

const router = Router();

const loginSchema = z.object({
  // 이메일 전용. 과거에는 사내 ID 도 허용했지만 정책 단순화로 이메일로만 로그인.
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * 유니크한 사번(employeeNo)을 자동 생성.
 * 포맷: HB + 6자리 숫자 (예: HB123456)
 * 충돌 시 최대 50회 재시도 후 타임스탬프 기반 fallback.
 */
export async function generateUniqueEmployeeNo(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const n = Math.floor(100000 + Math.random() * 900000);
    const candidate = `HB${n}`;
    const dup = await prisma.user.findFirst({
      where: { employeeNo: candidate },
      select: { id: true },
    });
    if (!dup) return candidate;
  }
  return `HB${Date.now().toString().slice(-8)}`;
}

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
      superAdmin: user.superAdmin,
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
  // 사번은 서버가 자동 부여 — 사용자가 입력하지 않음. 중복 절대 없음 (유니크 체크 반복).
  const employeeNo = await generateUniqueEmployeeNo();
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      role: key.role,
      team: key.team,
      position: key.position,
      employeeNo,
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
      superAdmin: user.superAdmin,
    },
  });
});

router.post("/logout", async (req, res) => {
  clearAuthCookie(res);
  clearSuperCookie(res);
  res.json({ ok: true });
});

/* ===== 총관리자 step-up (비밀번호 재확인) ===== */
router.post("/step-up", requireAuth, async (req, res) => {
  const u = (req as any).user;
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  if (!user || !user.superAdmin) return res.status(403).json({ error: "forbidden" });
  const password = String(req.body?.password ?? "");
  if (!password) return res.status(400).json({ error: "비밀번호를 입력해주세요" });

  // 총관리자는 반드시 별도의 super 비밀번호가 설정되어 있어야 함 — 일반 비밀번호 fallback 금지
  if (!user.superPasswordHash) {
    await writeLog(user.id, "SUPER_STEPUP_FAIL", undefined, "no_super_password_set", req.ip);
    return res.status(403).json({ error: "총관리자 전용 비밀번호가 설정되어있지 않아요. 서버 관리자에게 문의하세요." });
  }
  const ok = await bcrypt.compare(password, user.superPasswordHash);
  if (!ok) {
    await writeLog(user.id, "SUPER_STEPUP_FAIL", undefined, undefined, req.ip);
    return res.status(401).json({ error: "비밀번호가 일치하지 않습니다" });
  }

  const token = signSuper(user.id);
  setSuperCookie(res, token);
  await writeLog(user.id, "SUPER_STEPUP_OK", undefined, `ttl=${SUPER_TTL_SEC}s`, req.ip);
  res.json({ ok: true, expiresAt: Date.now() + SUPER_TTL_SEC * 1000 });
});

/**
 * ===== 데스크톱 앱 전용 생체 인증 =====
 * Electron Chromium 이 macOS Touch ID 를 WebAuthn 플랫폼 인증기로 노출하지 못해서,
 * main 프로세스가 직접 systemPreferences.promptTouchID 로 OS 프롬프트를 띄우는 별도 경로.
 *
 * 등록 플로우:
 *   1. 총관리자가 비번으로 1차 step-up (기존 /auth/step-up)
 *   2. step-up 상태에서 /auth/desktop-biometric/enroll 로 현재 기기의 deviceId 등록
 * 잠금 해제:
 *   3. 다음부터는 OS Touch ID 통과 + (userId, deviceId) 가 등록되어 있으면 super cookie 발급
 *
 * deviceId 는 Electron userData 폴더에 저장된 랜덤 UUID (main 프로세스가 생성).
 * 사용자가 직접 수정할 수 없고 앱 재설치 시 재생성됨.
 */
router.get("/desktop-biometric", requireAuth, async (req, res) => {
  const u = (req as any).user;
  const list = await prisma.desktopBiometric.findMany({
    where: { userId: u.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, deviceId: true, deviceName: true, createdAt: true, lastUsedAt: true },
  });
  res.json({ devices: list });
});

router.post("/desktop-biometric/enroll", requireAuth, requireSuperAdminStepUp, async (req, res) => {
  const u = (req as any).user;
  const isDesktop = req.get("x-hinest-desktop") === "1";
  if (!isDesktop) return res.status(400).json({ error: "데스크톱 앱에서만 등록할 수 있어요" });

  const deviceId = String(req.body?.deviceId ?? "").trim();
  const deviceName = String(req.body?.deviceName ?? "").trim() || null;
  if (!deviceId || deviceId.length < 8) return res.status(400).json({ error: "invalid deviceId" });

  const row = await prisma.desktopBiometric.upsert({
    where: { userId_deviceId: { userId: u.id, deviceId } },
    create: { userId: u.id, deviceId, deviceName },
    update: { deviceName: deviceName ?? undefined },
  });
  await writeLog(u.id, "DESKTOP_BIO_ENROLL", row.id.slice(0, 8), deviceName ?? undefined, req.ip);
  res.json({ ok: true, id: row.id });
});

router.delete("/desktop-biometric/:id", requireAuth, async (req, res) => {
  const u = (req as any).user;
  const row = await prisma.desktopBiometric.findUnique({ where: { id: req.params.id } });
  if (!row || row.userId !== u.id) return res.status(404).json({ error: "not found" });
  await prisma.desktopBiometric.delete({ where: { id: row.id } });
  await writeLog(u.id, "DESKTOP_BIO_REMOVE", row.id.slice(0, 8), row.deviceName ?? undefined, req.ip);
  res.json({ ok: true });
});

router.post("/desktop-biometric/stepup", requireAuth, async (req, res) => {
  const u = (req as any).user;
  const isDesktop = req.get("x-hinest-desktop") === "1";
  if (!isDesktop) return res.status(400).json({ error: "데스크톱 앱에서만 사용할 수 있어요" });

  const user = await prisma.user.findUnique({ where: { id: u.id } });
  if (!user || !user.superAdmin) return res.status(403).json({ error: "forbidden" });

  const deviceId = String(req.body?.deviceId ?? "").trim();
  if (!deviceId) return res.status(400).json({ error: "invalid deviceId" });

  const row = await prisma.desktopBiometric.findUnique({
    where: { userId_deviceId: { userId: u.id, deviceId } },
  });
  if (!row) {
    await writeLog(user.id, "SUPER_STEPUP_FAIL_DESKTOP_BIO", deviceId.slice(0, 8), "not_enrolled", req.ip);
    return res.status(403).json({ error: "이 기기는 Touch ID 등록이 되어있지 않아요", code: "NOT_ENROLLED" });
  }

  await prisma.desktopBiometric.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  const token = signSuper(user.id);
  setSuperCookie(res, token);
  await writeLog(user.id, "SUPER_STEPUP_OK_DESKTOP_BIO", row.id.slice(0, 8), row.deviceName ?? undefined, req.ip);
  res.json({ ok: true, expiresAt: Date.now() + SUPER_TTL_SEC * 1000 });
});

router.post("/step-down", requireAuth, async (req, res) => {
  const u = (req as any).user;
  clearSuperCookie(res);
  await writeLog(u.id, "SUPER_STEPDOWN", undefined, undefined, req.ip);
  res.json({ ok: true });
});

router.get("/super-session", requireAuth, async (req, res) => {
  const u = (req as any).user;
  if (!u.superAdmin) return res.json({ active: false });
  const v = verifySuperToken(req, u.id);
  if (!v) return res.json({ active: false });
  res.json({ active: true, expiresAt: v.exp });
});

export default router;
