import { Router, type Request, type Response, type NextFunction } from "express";
import express from "express";
import crypto from "node:crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { prisma } from "../lib/db.js";

/**
 * 외부 → 내부 웹훅 수신 엔드포인트.
 *
 * 인증/신뢰 모델
 *  - URL 의 secret `:token` 이 1차 식별자. DB 의 `WebhookChannel.token` 과 일치해야 함.
 *  - 추가로 채널에 `signingSecret` 이 설정돼 있으면 `X-Signature: sha256=<hex>` 헤더
 *    (raw body 기준 HMAC-SHA256) 를 `crypto.timingSafeEqual` 로 검증. 타이밍 공격 차단.
 *  - `X-Webhook-Id` 헤더가 있으면 10분 윈도우 내 중복 ID 는 재전송으로 간주하고 무시
 *    (리플레이 방어). 헤더가 없으면 중복 방지는 수신자가 DB dedupe 로 처리.
 *
 * 가용성
 *  - `/:token` 라우트에 전용 rate limiter — 토큰이 유출됐을 때 폭주 막기.
 *  - 전용 `express.json({ limit: "64kb" })` — 전역 2mb 와 별개로 더 타이트하게.
 *
 * 본 라우터는 `requireAuth` 를 적용하지 않으므로 `/api/webhook` prefix 에 별도 마운트.
 */
const router = Router();

/** 채널별 rate limit — IP + token 조합 기준으로 10초당 10회 (= 60/분) 정도. */
const webhookLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  // ipKeyGenerator 로 IPv6 를 /64 서브넷으로 정규화 — IPv6 사용자가 주소 바꿔가며
  // 회피하는 걸 차단. token 조합으로 채널별 격리.
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? "")}|${req.params.token ?? ""}`,
  message: { error: "rate limited" },
});

/** 리플레이 방어용 in-memory dedupe — X-Webhook-Id 기준 10분 TTL. */
const seenIds = new Map<string, number>();
const SEEN_TTL_MS = 10 * 60 * 1000;
function checkReplay(id: string | undefined): boolean {
  if (!id) return false;
  const now = Date.now();
  // 캐시 정리 (가볍게)
  if (seenIds.size > 5000) {
    for (const [k, t] of seenIds) if (now - t > SEEN_TTL_MS) seenIds.delete(k);
  }
  const prev = seenIds.get(id);
  if (prev && now - prev < SEEN_TTL_MS) return true;
  seenIds.set(id, now);
  return false;
}

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

/**
 * GitHub 웹훅은 `X-GitHub-Event` 헤더 + payload 의 action/pull_request/commits 등
 * 조합으로 의미가 결정됨. 일반 parser 로는 payload.action ("opened") 만 떨궈져서
 * 무슨 일이 일어났는지 판독 불가 → Discord 처럼 `[repo:branch] N new commits` 같은
 * 풍부한 라벨로 제목/본문을 만든다.
 *
 * 지원 이벤트 (나머지는 `[repo] <event> <action>` 으로 fallback):
 *   push, pull_request, issues, issue_comment, pull_request_review,
 *   pull_request_review_comment, create, delete, release, fork, star/watch, ping
 */
function pickGitHubTitleBody(event: string, p: any): { title: string; body: string | null } {
  const repo = p?.repository?.full_name || p?.repository?.name || "unknown";
  const sender = p?.sender?.login ? ` · @${p.sender.login}` : "";
  const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  if (event === "ping") {
    return { title: `[${repo}] 웹훅 연결됨`, body: p?.zen || null };
  }

  if (event === "push") {
    const branch = String(p?.ref ?? "").replace(/^refs\/heads\//, "") || "?";
    const commits: any[] = Array.isArray(p?.commits) ? p.commits : [];
    const n = commits.length;
    const title = `[${repo}:${branch}] ${n} new commit${n === 1 ? "" : "s"}${sender}`;
    const lines = commits
      .slice(0, 5)
      .map((c) => {
        const sha = String(c?.id ?? "").slice(0, 7);
        const msg = String(c?.message ?? "").split("\n")[0];
        const author = c?.author?.name ? ` — ${c.author.name}` : "";
        return `${sha} ${msg}${author}`;
      });
    const body = lines.length ? lines.join("\n") : null;
    return { title, body };
  }

  if (event === "pull_request") {
    const action = p?.action ?? "updated";
    const num = p?.number ?? p?.pull_request?.number;
    const prTitle = p?.pull_request?.title ?? "";
    const merged = action === "closed" && p?.pull_request?.merged === true;
    const label = merged ? "merged" : action;
    return {
      title: `[${repo}] PR #${num} ${label}: ${trunc(prTitle, 120)}${sender}`,
      body: p?.pull_request?.body ? trunc(String(p.pull_request.body), 1000) : null,
    };
  }

  if (event === "issues") {
    const action = p?.action ?? "updated";
    const num = p?.issue?.number;
    const issueTitle = p?.issue?.title ?? "";
    return {
      title: `[${repo}] Issue #${num} ${action}: ${trunc(issueTitle, 120)}${sender}`,
      body: p?.issue?.body ? trunc(String(p.issue.body), 1000) : null,
    };
  }

  if (event === "issue_comment") {
    const num = p?.issue?.number;
    const issueTitle = p?.issue?.title ?? "";
    const commentExcerpt = String(p?.comment?.body ?? "").split("\n")[0];
    return {
      title: `[${repo}] Comment on #${num}: ${trunc(issueTitle, 100)}${sender}`,
      body: commentExcerpt ? trunc(commentExcerpt, 1000) : null,
    };
  }

  if (event === "pull_request_review") {
    const num = p?.pull_request?.number;
    const state = p?.review?.state ?? "";
    return {
      title: `[${repo}] PR #${num} review: ${state}${sender}`,
      body: p?.review?.body ? trunc(String(p.review.body), 1000) : null,
    };
  }

  if (event === "pull_request_review_comment") {
    const num = p?.pull_request?.number;
    const excerpt = String(p?.comment?.body ?? "").split("\n")[0];
    return {
      title: `[${repo}] PR #${num} review comment${sender}`,
      body: excerpt ? trunc(excerpt, 1000) : null,
    };
  }

  if (event === "create" || event === "delete") {
    const refType = p?.ref_type ?? "ref"; // branch | tag
    const refName = p?.ref ?? "?";
    const verb = event === "create" ? "created" : "deleted";
    return {
      title: `[${repo}] ${refType} ${verb}: ${refName}${sender}`,
      body: null,
    };
  }

  if (event === "release") {
    const action = p?.action ?? "released";
    const tag = p?.release?.tag_name ?? "";
    const name = p?.release?.name ?? "";
    return {
      title: `[${repo}] Release ${action}: ${tag}${name ? ` (${name})` : ""}${sender}`,
      body: p?.release?.body ? trunc(String(p.release.body), 1000) : null,
    };
  }

  if (event === "fork") {
    const child = p?.forkee?.full_name ?? "";
    return { title: `[${repo}] forked → ${child}${sender}`, body: null };
  }

  if (event === "star" || event === "watch") {
    const action = p?.action ?? "started";
    return { title: `[${repo}] ⭐ ${action}${sender}`, body: null };
  }

  // fallback — 알려지지 않은 이벤트는 event + action 조합으로
  const action = p?.action ? ` ${p.action}` : "";
  return { title: `[${repo}] ${event}${action}${sender}`, body: null };
}

/**
 * raw body 를 보존한 채 JSON 파싱. 서명 검증을 위해 요청 원문 문자열이 필요.
 * 전역 `express.json()` 이 이미 걸려 있지만, 더 엄격한 limit 과 rawBody 캡처가 필요해
 * 이 라우터 전용으로 다시 파싱.
 */
const bodyWithRaw = express.json({
  limit: "64kb",
  verify: (req, _res, buf) => {
    (req as any).rawBody = Buffer.isBuffer(buf) ? buf.toString("utf8") : "";
  },
});

/** 타이밍-세이프 hex 비교. 길이 다르면 즉시 false. */
function safeEqualHex(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, "hex");
    const b = Buffer.from(bHex, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

router.post(
  "/:token",
  webhookLimiter,
  bodyWithRaw,
  async (req: Request, res: Response, _next: NextFunction) => {
    const ch = await prisma.webhookChannel.findUnique({
      where: { token: req.params.token },
    });
    // 존재하지 않는 토큰이어도 동일한 응답 시간대를 유지하기 위해 즉시 돌려주지 않음.
    // (실전에선 일정한 페이크 HMAC 을 돌려 차이를 더 줄일 수 있지만, DB 가 이미 인덱스라 차이 작음)
    if (!ch) return res.status(404).json({ error: "unknown webhook" });

    // HMAC 서명 검증 — 채널에 signingSecret 이 있으면 필수.
    if (ch.signingSecret) {
      const header = String(req.header("x-signature") ?? "");
      const m = header.match(/^sha256=([0-9a-fA-F]+)$/);
      const raw = (req as any).rawBody ?? "";
      if (!m) return res.status(401).json({ error: "missing or malformed X-Signature" });
      const expected = crypto
        .createHmac("sha256", ch.signingSecret)
        .update(raw, "utf8")
        .digest("hex");
      if (!safeEqualHex(m[1], expected)) {
        return res.status(401).json({ error: "invalid signature" });
      }
    }

    // 리플레이 방어 — X-Webhook-Id 헤더 중복 감지
    const dedupeId = req.header("x-webhook-id") || req.header("x-idempotency-key");
    if (checkReplay(dedupeId ?? undefined)) {
      return res.status(200).json({ ok: true, deduped: true });
    }

    const payload: any = req.body ?? {};
    const raw = typeof payload === "string" ? payload : JSON.stringify(payload);

    // GitHub 는 `X-GitHub-Event` 헤더로 이벤트 종류를 전달. 헤더가 있으면
    // GitHub 전용 포맷터로 풍부한 title/body 구성. 없으면 일반 parser 사용.
    const ghEvent = String(req.header("x-github-event") ?? "").trim();
    let title: string;
    let body: string | null;
    if (ghEvent) {
      const r = pickGitHubTitleBody(ghEvent, payload);
      title = r.title.slice(0, 200);
      body = r.body ? r.body.slice(0, 4000) : null;
    } else {
      title = pickTitle(payload);
      body = pickBody(payload);
    }
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
  }
);

export default router;

/**
 * 새 채널 생성 시 쓸 token 생성기 — URL-safe.
 * 프로젝트 라우터에서 import 해서 씀.
 */
export function generateWebhookToken() {
  return crypto.randomBytes(24).toString("base64url");
}

/** 새 채널 생성 시 선택적으로 쓸 signing secret 생성기 — 32바이트 base64url. */
export function generateSigningSecret() {
  return crypto.randomBytes(32).toString("base64url");
}
