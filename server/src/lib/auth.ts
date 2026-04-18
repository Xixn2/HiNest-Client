import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db.js";

// 프로덕션에서 JWT_SECRET 이 비어 있으면 즉시 기동 실패 — 기본값 토큰 위조 방지
const IS_PROD = process.env.NODE_ENV === "production";
const RAW_SECRET = process.env.JWT_SECRET;
if (IS_PROD && (!RAW_SECRET || RAW_SECRET.length < 16)) {
  throw new Error(
    "JWT_SECRET 환경변수가 없거나 너무 짧습니다. 16자 이상의 강한 시크릿을 지정하세요."
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
