import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { prisma } from "./db.js";

/**
 * API 토큰 검증 미들웨어 — \`Authorization: Bearer hin_...\` 형식.
 *
 * 사용 예: 외부 통합용 엔드포인트에 `requireApiToken("read:users")` 처럼 스코프 체크.
 *
 *   router.post("/webhooks/incoming", requireApiToken("write:notice"), handler);
 *
 * - sha256 hash 매칭
 * - 만료/취소 체크
 * - lastUsedAt 갱신 (블로킹 X — fire and forget)
 * - 스코프 체크
 */

export function requireApiToken(scope?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization ?? "";
    const m = auth.match(/^Bearer\s+(hin_[a-f0-9]+)$/i);
    if (!m) return res.status(401).json({ error: "missing api token" });
    const raw = m[1];
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    const tok = await prisma.apiToken.findUnique({ where: { hash } });
    if (!tok || tok.revokedAt) return res.status(401).json({ error: "invalid token" });
    if (tok.expiresAt && tok.expiresAt < new Date()) return res.status(401).json({ error: "expired token" });
    if (scope) {
      const owned = (tok.scopes ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!owned.includes(scope)) return res.status(403).json({ error: `requires scope: ${scope}` });
    }
    (req as any).apiToken = { id: tok.id, name: tok.name, scopes: tok.scopes };
    // 비동기 갱신 (요청 응답 시간에 영향 X)
    prisma.apiToken.update({ where: { id: tok.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    next();
  };
}
