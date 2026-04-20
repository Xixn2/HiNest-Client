import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { requireAuth } from "../lib/auth.js";
import { isStorageEnabled, uploadFile } from "../lib/storage.js";

/**
 * 업로드 플로우.
 *  1. multer 는 memoryStorage — 파일을 메모리로만 받는다 (디스크 미경유).
 *  2. Supabase Storage 활성화 시 → 버킷에 올림. URL 은 /uploads/<key> 로 반환해
 *     기존 클라이언트 코드·DB 저장값이 그대로 유지됨. 실제 파일은 서버가 프록시해서 내려줌.
 *  3. 비활성화 시 (로컬 dev) → 과거와 동일하게 uploads/ 디렉터리에 파일 기록.
 *
 * Render Free 디스크는 재시작 시 날아가기 때문에 프로덕션은 반드시 Supabase 경로를 쓴다.
 */

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// multer는 multipart 파일명을 latin1로 해석해서 한글이 깨짐 → UTF-8로 복원
function fixName(name: string) {
  if (!name) return name;
  try {
    return Buffer.from(name, "latin1").toString("utf8");
  } catch {
    return name;
  }
}

// XSS 위험이 있는 타입/확장자는 업로드 차단 (SVG/HTML/JS/XML 등)
// 같은 origin 에서 서빙되기 때문에 이런 파일을 클릭하면 쿠키/세션에 접근 가능.
const BLOCKED_EXTS = new Set([
  ".svg", ".html", ".htm", ".xhtml", ".xml", ".js", ".mjs", ".cjs",
  ".php", ".phtml", ".jsp", ".asp", ".aspx", ".sh", ".bat", ".cmd",
  ".exe", ".dll", ".app", ".jar",
]);
const BLOCKED_MIME_PREFIXES = [
  "text/html", "application/xhtml", "image/svg", "application/javascript",
  "text/javascript", "application/x-javascript", "application/xml", "text/xml",
];

function safeExt(name: string) {
  // 경로 분리자 제거 + 확장자만 추출
  const base = path.basename(name || "");
  return path.extname(base).toLowerCase();
}

// 메모리 스토리지 — 50MB 제한이라 RAM 부담 적음. 디스크 미경유 정책과 맞물림.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req: any, file: any, cb: any) => {
    const ext = safeExt(fixName(file.originalname || ""));
    if (BLOCKED_EXTS.has(ext)) {
      return cb(new Error(`허용되지 않는 파일 형식입니다 (${ext})`));
    }
    const mime = String(file.mimetype || "").toLowerCase();
    if (BLOCKED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
      return cb(new Error(`허용되지 않는 MIME 형식입니다 (${mime})`));
    }
    cb(null, true);
  },
});

const router = Router();
router.use(requireAuth);

router.post("/", (req, res, next) => {
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ error: err.message ?? "업로드 실패" });
    }
    next();
  });
}, async (req, res) => {
  const f = (req as any).file as {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  } | undefined;
  if (!f) return res.status(400).json({ error: "no file" });

  const originalName = fixName(f.originalname);
  const ext = safeExt(originalName);
  const id = crypto.randomBytes(12).toString("hex");
  const key = `${Date.now()}-${id}${ext}`;
  const mime = String(f.mimetype || "application/octet-stream");

  try {
    if (isStorageEnabled()) {
      await uploadFile(key, f.buffer, mime);
    } else {
      // dev fallback — 디스크 기록 (프로덕션은 Supabase 경로를 반드시 씀)
      await fs.promises.writeFile(path.join(UPLOAD_DIR, key), f.buffer);
    }
  } catch (e: any) {
    console.error("[upload] failed", e);
    return res.status(500).json({ error: "업로드 저장 실패" });
  }

  let kind: "IMAGE" | "VIDEO" | "FILE" = "FILE";
  if (mime.startsWith("image/")) kind = "IMAGE";
  else if (mime.startsWith("video/")) kind = "VIDEO";

  res.json({
    url: `/uploads/${key}`,
    name: originalName,
    type: mime,
    size: f.size,
    kind,
  });
});

export default router;
export { UPLOAD_DIR };
