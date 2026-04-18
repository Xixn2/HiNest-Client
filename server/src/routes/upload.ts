import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { requireAuth } from "../lib/auth.js";

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

const storage = multer.diskStorage({
  destination: (_req: any, _file: any, cb: any) => cb(null, UPLOAD_DIR),
  filename: (_req: any, file: any, cb: any) => {
    const fixed = fixName(file.originalname || "");
    file.originalname = fixed;
    const ext = safeExt(fixed);
    const id = crypto.randomBytes(12).toString("hex");
    cb(null, `${Date.now()}-${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB (기존 100MB → 축소)
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
}, (req, res) => {
  const f = (req as any).file;
  if (!f) return res.status(400).json({ error: "no file" });

  const mime = String(f.mimetype || "");
  let kind: "IMAGE" | "VIDEO" | "FILE" = "FILE";
  if (mime.startsWith("image/")) kind = "IMAGE";
  else if (mime.startsWith("video/")) kind = "VIDEO";

  res.json({
    url: `/uploads/${f.filename}`,
    name: fixName(f.originalname),
    type: f.mimetype,
    size: f.size,
    kind,
  });
});

export default router;
export { UPLOAD_DIR };
