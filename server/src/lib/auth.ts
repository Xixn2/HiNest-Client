import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db.js";

const SECRET = process.env.JWT_SECRET ?? "hinest-dev-secret";
const COOKIE = "hinest_token";

export interface AuthUser {
  id: string;
  role: string;
  name: string;
  email: string;
}

export function signToken(user: { id: string; role: string; name: string; email: string }) {
  return jwt.sign(user, SECRET, { expiresIn: "7d" });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: "unauthorized" });
  try {
    const payload = jwt.verify(token, SECRET) as AuthUser;
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.active) return res.status(401).json({ error: "unauthorized" });
    (req as any).user = {
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
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

export async function writeLog(userId: string | null, action: string, target?: string, detail?: string, ip?: string) {
  try {
    await prisma.auditLog.create({
      data: { userId: userId ?? undefined, action, target, detail, ip },
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
