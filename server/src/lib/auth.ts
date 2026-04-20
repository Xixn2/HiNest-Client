import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db.js";

// JWT_SECRET 은 언제나 필수. NODE_ENV 누락/오탈자로 프로덕션에서 하드코딩 fallback 이 쓰이는
// 사고를 막기 위해, 개발 모드에서도 명시적으로 .env 에 지정하도록 강제한다.
// 다만 개발 편의를 위해 ALLOW_DEV_JWT_SECRET=1 이면 임의 개발 시크릿을 허용.
const IS_PROD = process.env.NODE_ENV === "production";
const RAW_SECRET = process.env.JWT_SECRET;
const ALLOW_DEV_FALLBACK = !IS_PROD && process.env.ALLOW_DEV_JWT_SECRET === "1";
if (!RAW_SECRET || RAW_SECRET.length < 16) {
  if (!ALLOW_DEV_FALLBACK) {
    throw new Error(
      "JWT_SECRET 환경변수가 없거나 너무 짧습니다. 16자 이상의 강한 시크릿을 .env 에 지정하세요. " +
      "(개발 편의상 임시로 허용하려면 ALLOW_DEV_JWT_SECRET=1)"
    );
  }
  // eslint-disable-next-line no-console
  console.warn(
    "[auth] WARNING: JWT_SECRET 이 없어 개발용 임시 시크릿을 사용합니다. 프로덕션 기동 전에 반드시 .env 에 JWT_SECRET 을 설정하세요."
  );
}
const SECRET = RAW_SECRET ?? "hinest-dev-secret-change-me";
const COOKIE = "hinest_token";
const SUPER_COOKIE = "hinest_super";
const SUPER_TTL_SEC = 15 * 60; // 15분
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: IS_PROD,
  path: "/",
};

export interface AuthUser {
  id: string;
  role: string;
  name: string;
  email: string;
  superAdmin: boolean;
}

export function signToken(user: { id: string; role: string; name: string; email: string }) {
  return jwt.sign(user, SECRET, { expiresIn: "7d" });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    ...COOKIE_BASE,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE, COOKIE_BASE);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    const payload = jwt.verify(token, SECRET) as any;
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.active) return res.status(401).json({ error: "unauthorized" });
    (req as any).user = {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      superAdmin: user.superAdmin,
    } as AuthUser;
    // 핸들러에서 user row 가 또 필요하면 재조회하지 말고 이거 쓰기 — /api/me 처럼
    // 인증만 거치고 바로 user 필드를 되돌려주는 엔드포인트에서 DB 왕복 1번 절약.
    (req as any).userRecord = user;
    next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const u = (req as any).user as AuthUser | undefined;
  if (!u || u.role !== "ADMIN") return res.status(403).json({ error: "forbidden" });
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const u = (req as any).user as AuthUser | undefined;
  if (!u || !u.superAdmin) return res.status(403).json({ error: "forbidden" });
  next();
}

/* ---- Super admin step-up (비밀번호 재인증) ---- */
export function signSuper(userId: string) {
  return jwt.sign({ sub: userId, kind: "super" }, SECRET, {
    expiresIn: `${SUPER_TTL_SEC}s`,
  });
}

export function setSuperCookie(res: Response, token: string) {
  res.cookie(SUPER_COOKIE, token, {
    ...COOKIE_BASE,
    maxAge: SUPER_TTL_SEC * 1000,
  });
}

export function clearSuperCookie(res: Response) {
  res.clearCookie(SUPER_COOKIE, COOKIE_BASE);
}

export function verifySuperToken(req: Request, userId: string): { exp: number } | null {
  const tok = (req as any).cookies?.[SUPER_COOKIE];
  if (!tok) return null;
  try {
    const p = jwt.verify(tok, SECRET) as any;
    if (p.sub !== userId || p.kind !== "super") return null;
    return { exp: p.exp * 1000 };
  } catch {
    return null;
  }
}

/** 총관리자 민감 액션용: JWT 본인 + 초최근 비밀번호 재인증 필요 */
export function requireSuperAdminStepUp(req: Request, res: Response, next: NextFunction) {
  const u = (req as any).user as AuthUser | undefined;
  if (!u || !u.superAdmin) return res.status(403).json({ error: "forbidden" });
  const v = verifySuperToken(req, u.id);
  if (!v) {
    return res.status(401).json({
      error: "비밀번호 재확인이 필요합니다",
      code: "SUPER_STEPUP_REQUIRED",
    });
  }
  (req as any).superExpiresAt = v.exp;
  next();
}

export { SUPER_TTL_SEC };

export async function writeLog(userId: string | null, action: string, target?: string, detail?: string, ip?: string) {
  try {
    await prisma.auditLog.create({
      data: { userId: userId ?? undefined, action, target, detail, ip },
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
