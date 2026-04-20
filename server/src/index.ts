import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
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
import path from "node:path";
import mime from "mime-types";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);
const ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:1000";

// 기본 보안 헤더 — CSP 는 프런트 개발 편의상 기본만.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // /uploads 타 origin 로드 허용
    contentSecurityPolicy: false, // API 서버라 HTML 안 서빙. 필요 시 활성화.
  })
);
app.use(
  cors({
    origin: [ORIGIN, "http://localhost:1000", "http://127.0.0.1:1000"],
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

app.get("/api/health", (_req, res) => res.json({ ok: true }));

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
// 웹훅 수신은 인증 없음 — 라우터 내부에서 token 검증.
app.use("/api/webhook", webhookRouter);

// /uploads — 인증된 유저만 접근, 비이미지/비영상은 강제 다운로드로 내려서 브라우저 인라인 실행 차단.
// 추가로 nosniff 로 MIME 변조 차단, 파일명 traversal 방지.
const INLINE_MIME_PREFIXES = ["image/", "video/", "audio/"];
app.use("/uploads", requireAuth, (req, res, next) => {
  const name = req.path.replace(/^\/+/, "");
  // 경로 탈출 / 상대경로 차단
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return res.status(400).json({ error: "invalid filename" });
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  // 이미지/영상/오디오가 아니면 인라인 실행 방지 + 강제 다운로드
  const mt = mime.lookup(name) || "application/octet-stream";
  const inline = INLINE_MIME_PREFIXES.some((p) => String(mt).startsWith(p));
  if (!inline) {
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
  }
  next();
}, express.static(UPLOAD_DIR, { maxAge: "1d", fallthrough: false }));

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
