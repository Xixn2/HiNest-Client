import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { requireAuth } from "./lib/auth.js";
import authRouter from "./routes/auth.js";
import adminRouter from "./routes/admin.js";
import usersRouter from "./routes/users.js";
import scheduleRouter from "./routes/schedule.js";
import attendanceRouter from "./routes/attendance.js";
import journalRouter from "./routes/journal.js";
import noticeRouter from "./routes/notice.js";
import chatRouter from "./routes/chat.js";
import expenseRouter from "./routes/expense.js";
import uploadRouter, { UPLOAD_DIR } from "./routes/upload.js";
import { isStorageEnabled, downloadFile, storageBackend, storageBucket } from "./lib/storage.js";
import fs from "node:fs";
import notificationRouter from "./routes/notification.js";
import searchRouter from "./routes/search.js";
import documentRouter from "./routes/document.js";
import approvalRouter from "./routes/approval.js";
import passkeyRouter from "./routes/passkey.js";
import profileRouter from "./routes/profile.js";
import versionRouter from "./routes/version.js";
import meRouter from "./routes/me.js";
import navRouter from "./routes/nav.js";
import projectRouter from "./routes/project.js";
import webhookRouter from "./routes/webhook.js";
import meetingRouter from "./routes/meeting.js";
import path from "node:path";
import mime from "mime-types";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const IS_PROD = process.env.NODE_ENV === "production";
const ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:1000";

// ALB(및 Vercel) 뒤에 있으므로 첫 번째 프록시의 X-Forwarded-For 를 신뢰.
// express-rate-limit 가 req.ip 로 실제 클라이언트 IP 를 식별하려면 필요.
// "trust proxy" 를 true 로 두면 모든 프록시 헤더를 신뢰해 스푸핑 위험이 있음 → 1.
if (IS_PROD) {
  app.set("trust proxy", 1);
}

// 기본 보안 헤더 — CSP 는 프런트 개발 편의상 기본만.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // /uploads 타 origin 로드 허용
    contentSecurityPolicy: false, // API 서버라 HTML 안 서빙. 필요 시 활성화.
  })
);

// gzip/brotli 압축 — JSON 응답 평균 70% 축소. 1KB 미만은 오버헤드라 threshold.
// SSE 같은 스트림은 compression 이 자동으로 건너뜀 (Content-Type text/event-stream).
app.use(
  compression({
    threshold: 1024,
    // 이미 압축된 바이너리(이미지·영상)는 건너뜀 — /uploads 스트림 이중 압축 방지.
    filter: (req, res) => {
      const ct = String(res.getHeader("Content-Type") || "");
      if (ct.startsWith("image/") || ct.startsWith("video/") || ct.startsWith("audio/")) return false;
      return compression.filter(req, res);
    },
  })
);

// CORS — 프로덕션은 CLIENT_ORIGIN 만 허용. 개발에선 로컬호스트 편의 허용.
const CORS_ORIGINS = IS_PROD
  ? [ORIGIN]
  : [ORIGIN, "http://localhost:1000", "http://127.0.0.1:1000"];
app.use(
  cors({
    origin: CORS_ORIGINS,
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// 레이트 리밋 — 브루트포스/DoS 방어.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10분
  limit: 30,                // 동일 IP 당 30회
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." },
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "업로드 요청이 너무 많습니다." },
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600, // 대다수 읽기/쓰기용
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

// 요청 로거 — 403/401 디버깅용
app.use((req, res, next) => {
  const started = Date.now();
  const originalUrl = req.originalUrl;
  res.on("finish", () => {
    if (res.statusCode >= 400 || originalUrl.startsWith("/api/auth/")) {
      const u = (req as any).user;
      const who = u ? `user=${u.email}(super=${u.superAdmin})` : "user=-";
      console.log(`[${new Date().toISOString().slice(11, 19)}] ${req.method} ${originalUrl} → ${res.statusCode} ${who} (${Date.now() - started}ms)`);
    }
  });
  next();
});

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    storage: { backend: storageBackend(), bucket: storageBucket() },
  })
);

// 전역 API 레이트 리밋 — 라우트별 특수 limiter 는 그 뒤에 추가로 씌운다.
// (login/upload 는 더 엄격한 limiter 가 먼저 적용됨)
app.use("/api", apiLimiter);

app.use("/api/auth", loginLimiter, authRouter);
app.use("/api/me", meRouter);
app.use("/api/admin", adminRouter);
app.use("/api/users", usersRouter);
app.use("/api/schedule", scheduleRouter);
app.use("/api/attendance", attendanceRouter);
app.use("/api/journal", journalRouter);
app.use("/api/notice", noticeRouter);
app.use("/api/chat", chatRouter);
app.use("/api/expense", expenseRouter);
app.use("/api/upload", uploadLimiter, uploadRouter);
app.use("/api/notification", notificationRouter);
app.use("/api/search", searchRouter);
app.use("/api/document", documentRouter);
app.use("/api/approval", approvalRouter);
app.use("/api/passkey", passkeyRouter);
app.use("/api/profile", profileRouter);
app.use("/api/version", versionRouter);
app.use("/api/nav", navRouter);
app.use("/api/project", projectRouter);
app.use("/api/meeting", meetingRouter);
// 웹훅 수신은 인증 없음 — 라우터 내부에서 token 검증.
app.use("/api/webhook", webhookRouter);

// /uploads — 인증된 유저만 접근, 비이미지/비영상은 강제 다운로드로 내려서 브라우저 인라인 실행 차단.
// 추가로 nosniff 로 MIME 변조 차단, 파일명 traversal 방지.
// Supabase Storage 활성화 시: 서버가 버킷에서 스트림으로 받아 그대로 중계 (프록시).
// 비활성화 시: 기존 디스크 정적 서빙 (로컬 dev 용).
const INLINE_MIME_PREFIXES = ["image/", "video/", "audio/"];
function applyUploadSecurityHeaders(res: express.Response, name: string, contentType: string) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  // defense-in-depth — /uploads 에서 내려가는 HTML 이 실수로라도 실행되지 않도록 tight CSP
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox; frame-ancestors 'none'");
  const inline = INLINE_MIME_PREFIXES.some((p) => contentType.startsWith(p));
  if (!inline) {
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  }
}

app.use("/uploads", requireAuth, async (req, res) => {
  const name = req.path.replace(/^\/+/, "");
  // 경로 탈출 / 상대경로 차단
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return res.status(400).json({ error: "invalid filename" });
  }

  // 1) Supabase Storage 우선 — 새 업로드는 여기 있음
  if (isStorageEnabled()) {
    const file = await downloadFile(name);
    if (file) {
      const mt = file.contentType || mime.lookup(name) || "application/octet-stream";
      applyUploadSecurityHeaders(res, name, String(mt));
      res.setHeader("Content-Type", String(mt));
      res.setHeader("Content-Length", String(file.size));
      res.setHeader("Cache-Control", "private, max-age=86400");
      return res.end(file.buffer);
    }
    // 버킷에 없으면 legacy 디스크 fallback 시도 (마이그레이션 이전 파일)
  }

  // 2) 디스크 fallback — dev 모드 / legacy 파일
  const diskPath = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(diskPath)) {
    return res.status(404).json({ error: "not found" });
  }
  const mt = mime.lookup(name) || "application/octet-stream";
  applyUploadSecurityHeaders(res, name, String(mt));
  res.setHeader("Content-Type", String(mt));
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.sendFile(diskPath);
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: err.message ?? "server error" });
});

// 방어: Prisma 등 async 에러로 프로세스가 죽지 않도록
process.on("unhandledRejection", (err) => {
  console.error("[unhandledRejection]", err);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

// 기존 공지 알림 백필 — linkUrl 이 "/notice" 로만 저장돼있던 예전 알림을 "/notice?id=..." 로 보정.
// 알림 title 에서 📌 접두어를 제거하고 notice.title 과 매칭.
import { prisma } from "./lib/db.js";
async function backfillNoticeLinks() {
  try {
    const stale = await prisma.notification.findMany({
      where: { type: "NOTICE", linkUrl: "/notice" },
      select: { id: true, title: true, createdAt: true },
    });
    if (stale.length === 0) return;
    const notices = await prisma.notice.findMany({ select: { id: true, title: true, createdAt: true } });
    let fixed = 0;
    for (const n of stale) {
      const plain = n.title.replace(/^📌\s*/, "").trim();
      // 동일 title 중 생성 시각이 알림에 가장 가까운 공지를 선택
      const candidates = notices.filter((x) => x.title === plain);
      if (candidates.length === 0) continue;
      const best = candidates.reduce((a, b) =>
        Math.abs(+new Date(a.createdAt) - +new Date(n.createdAt)) <
        Math.abs(+new Date(b.createdAt) - +new Date(n.createdAt)) ? a : b
      );
      await prisma.notification.update({
        where: { id: n.id },
        data: { linkUrl: `/notice?id=${best.id}` },
      });
      fixed++;
    }
    if (fixed) console.log(`[backfill] notice notifications linkUrl 보정: ${fixed}건`);
  } catch (e) {
    console.error("[backfill] notice link backfill 실패:", e);
  }
}

app.listen(PORT, () => {
  console.log(`[HiNest API] http://localhost:${PORT}`);
  backfillNoticeLinks();
});
