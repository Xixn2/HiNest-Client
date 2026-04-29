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
  createSession,
  evictSessionCache,
} from "../lib/auth.js";

const router = Router();

const loginSchema = z.object({
  // 이메일 전용. 과거에는 사내 ID 도 허용했지만 정책 단순화로 이메일로만 로그인.
  email: z.string().email().max(200),
  // bcrypt 는 72바이트 초과를 조용히 자르지만, 과도한 페이로드로 CPU 낭비 시키는
  // 슬로우 해시 DoS 를 막기 위해 128자 상한.
  password: z.string().min(1).max(128),
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

  const sid = await createSession(user.id, req);
  const token = signToken({ id: user.id, role: user.role, name: user.name, email: user.email }, sid);
  setAuthCookie(res, token);
  await writeLog(user.id, "LOGIN", user.email, `sid=${sid}`, req.ip);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      team: user.team,
      position: user.position,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      superAdmin: user.superAdmin,
    },
  });
});

const signupSchema = z.object({
  inviteKey: z.string().min(4).max(100),
  email: z.string().email().max(200),
  name: z.string().min(1).max(200),
  // 8자 이상 — 6자는 현대 기준으로 너무 약함. 기존 계정은 그대로 사용 가능하고 다음 변경 시 8자 요구.
  // bcrypt 72바이트 한계 가이드 + 슬로우 해시 DoS 방지로 128자 상한.
  password: z.string().min(8).max(128),
});

router.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "입력값을 확인해주세요 (비밀번호는 8자 이상)" });
  const { inviteKey, email, name, password } = parsed.data;

  const key = await prisma.inviteKey.findUnique({ where: { key: inviteKey } });
  if (!key) return res.status(400).json({ error: "유효하지 않은 초대키" });
  if (key.used) return res.status(400).json({ error: "이미 사용된 초대키" });
  if (key.expiresAt && key.expiresAt < new Date()) return res.status(400).json({ error: "만료된 초대키" });
  if (key.email && key.email.toLowerCase() !== email.toLowerCase())
    return res.status(400).json({ error: "초대키에 등록된 이메일과 일치하지 않습니다" });

  const dup = await prisma.user.findUnique({ where: { email } });
  if (dup) return res.status(400).json({ error: "이미 가입된 이메일" });

  // 2026 기준 bcrypt rounds 12 — 로그인/가입 지연은 체감 없고 GPU 공격 비용은 4x 증가.
  const passwordHash = await bcrypt.hash(password, 12);
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

  const sid = await createSession(user.id, req);
  const token = signToken({ id: user.id, role: user.role, name: user.name, email: user.email }, sid);
  setAuthCookie(res, token);
  await writeLog(user.id, "SIGNUP", user.email, `invite:${inviteKey} sid=${sid}`, req.ip);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      team: user.team,
      position: user.position,
      avatarColor: user.avatarColor,
      avatarUrl: user.avatarUrl,
      superAdmin: user.superAdmin,
    },
  });
});

router.post("/logout", requireAuth, async (req, res) => {
  // 현재 세션 row 도 revoke — 다른 디바이스 세션은 유지.
  const sid = (req as any).sessionId as string | null;
  if (sid) {
    try {
      await prisma.session.update({
        where: { id: sid },
        data: { revokedAt: new Date(), revokedById: (req as any).user?.id },
      });
      evictSessionCache(sid);
    } catch { /* ignore */ }
  }
  clearAuthCookie(res);
  clearSuperCookie(res);
  res.json({ ok: true });
});

/* ===== 총관리자 step-up (비밀번호 재확인) ===== */
router.post("/step-up", requireAuth, async (req, res) => {
  const u = (req as any).user;
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  if (!user || !user.superAdmin) return res.status(403).json({ error: "forbidden" });
  // 로그인/가입 schema 와 동일한 128자 상한. 제한 없이 bcrypt.compare 에
  // 넘기면 슬로우 해시 DoS 벡터.
  const rawPw = String(req.body?.password ?? "");
  const password = rawPw.length > 128 ? rawPw.slice(0, 128) : rawPw;
  if (!password) return res.status(400).json({ error: "비밀번호를 입력해주세요" });

  // 총관리자는 반드시 별도의 super 비밀번호가 설정되어 있어야 함 — 일반 비밀번호 fallback 금지.
  // 처음 super 권한을 받은 직후엔 superPasswordHash 가 null 이라 클라가 \"setup\" 화면으로 분기할 수 있도록
  // 별도 코드 반환.
  if (!user.superPasswordHash) {
    await writeLog(user.id, "SUPER_STEPUP_FAIL", undefined, "no_super_password_set", req.ip);
    return res.status(403).json({
      error: "총관리자 전용 비밀번호가 아직 설정되지 않았어요. 처음 설정해 주세요.",
      code: "SUPER_PW_NOT_SET",
    });
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

/* ===== 총관리자 step-up 비밀번호 최초 설정 / 변경 =====
 * - 최초 설정: 본인이 super 권한이고 superPasswordHash 가 null 이면 currentPassword 없이 설정 가능.
 * - 변경: currentPassword(현재 super 비번) 가 일치해야 함.
 * 정책: 8~128자, 본인의 일반 로그인 비밀번호와 다르게 (재사용 방지).
 */
router.post("/super-password", requireAuth, async (req, res) => {
  const u = (req as any).user;
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  if (!user || !user.superAdmin) return res.status(403).json({ error: "forbidden" });

  const rawNew = String(req.body?.next ?? "");
  const next = rawNew.length > 128 ? rawNew.slice(0, 128) : rawNew;
  if (!next || next.length < 8) return res.status(400).json({ error: "8자 이상 입력해 주세요" });

  const sameAsLogin = await bcrypt.compare(next, user.passwordHash).catch(() => false);
  if (sameAsLogin) {
    return res.status(400).json({ error: "일반 로그인 비밀번호와 달라야 해요" });
  }

  // 변경 모드면 current 검증 — null 이면 \"최초 설정\" 으로 간주.
  if (user.superPasswordHash) {
    const rawCur = String(req.body?.current ?? "");
    const current = rawCur.length > 128 ? rawCur.slice(0, 128) : rawCur;
    if (!current) return res.status(400).json({ error: "현재 총관리자 비밀번호가 필요해요" });
    const ok = await bcrypt.compare(current, user.superPasswordHash);
    if (!ok) {
      await writeLog(user.id, "SUPER_PW_CHANGE_FAIL", undefined, undefined, req.ip);
      return res.status(401).json({ error: "현재 총관리자 비밀번호가 일치하지 않아요" });
    }
  }

  const hash = await bcrypt.hash(next, 12);
  await prisma.user.update({ where: { id: user.id }, data: { superPasswordHash: hash } });
  await writeLog(user.id, user.superPasswordHash ? "SUPER_PW_CHANGE" : "SUPER_PW_SET", undefined, undefined, req.ip);
  res.json({ ok: true, firstTime: !user.superPasswordHash });
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

  // deviceId 는 Electron 에서 생성한 UUID (32~36자) — 128자면 여유 있음. 상한 없이 둘 경우
  // DB 유니크 인덱스에 수 MB 값이 들어가 저장/조회 비용이 튀고, passkey.ts 와도 format
  // 의도 일치.
  const rawDevId = String(req.body?.deviceId ?? "").trim();
  const deviceId = rawDevId.length > 128 ? rawDevId.slice(0, 128) : rawDevId;
  const rawDevName = String(req.body?.deviceName ?? "").trim();
  const deviceName = rawDevName ? (rawDevName.length > 80 ? rawDevName.slice(0, 80) : rawDevName) : null;
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

  const rawDevId = String(req.body?.deviceId ?? "").trim();
  const deviceId = rawDevId.length > 128 ? rawDevId.slice(0, 128) : rawDevId;
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
