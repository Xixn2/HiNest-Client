import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/db.js";

/**
 * 외부 → 내부 웹훅 수신 엔드포인트.
 * - 인증 없음 (URL 의 secret token 이 그 역할)
 * - `/api/webhook/:token` 에 JSON 또는 일반 텍스트 POST
 * - payload 에서 title/body 후보 필드를 휴리스틱으로 추출
 *
 * 본 라우터는 `requireAuth` 를 적용하지 않으므로 `/api/webhook` prefix 에 별도로 마운트해야 함.
 */
const router = Router();

function pickTitle(payload: any): string {
  if (!payload || typeof payload !== "object") return "Webhook";
  for (const k of ["title", "subject", "event", "name", "action", "type"]) {
    if (typeof payload[k] === "string" && payload[k].trim()) return String(payload[k]).slice(0, 200);
  }
  if (typeof payload.text === "string") return payload.text.split("\n")[0].slice(0, 200);
  if (typeof payload.message === "string") return payload.message.split("\n")[0].slice(0, 200);
  return "Webhook";
}
function pickBody(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  for (const k of ["body", "text", "message", "description", "content"]) {
    if (typeof payload[k] === "string") return String(payload[k]).slice(0, 4000);
  }
  return null;
}

router.post("/:token", async (req, res) => {
  const ch = await prisma.webhookChannel.findUnique({ where: { token: req.params.token } });
  if (!ch) return res.status(404).json({ error: "unknown webhook" });

  // body 는 JSON 도 문자열도 가능 — express.json 이 이미 JSON 파싱함.
  const payload: any = req.body ?? {};
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);

  const title = pickTitle(payload);
  const body = pickBody(payload);
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.ip ||
    null;

  const ev = await prisma.webhookEvent.create({
    data: {
      channelId: ch.id,
      title,
      body,
      rawPayload: raw.slice(0, 20000),
      sourceIp: ip,
    },
  });
  res.json({ ok: true, id: ev.id });
});

export default router;

/**
 * 새 채널 생성 시 쓸 token 생성기 — URL-safe.
 * 프로젝트 라우터에서 import 해서 씀.
 */
export function generateWebhookToken() {
  return crypto.randomBytes(24).toString("base64url");
}
