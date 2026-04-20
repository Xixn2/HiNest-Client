import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";
import { notifyAllUsers } from "../lib/notify.js";

const router = Router();
router.use(requireAuth);

/**
 * 공지 작성/삭제 권한 allowlist — 새 역할이 추가돼도 기본은 거부되도록 denylist 대신 allowlist.
 */
const NOTICE_WRITE_ROLES = new Set(["ADMIN", "MANAGER"]);
function canWriteNotice(role: unknown): boolean {
  return typeof role === "string" && NOTICE_WRITE_ROLES.has(role);
}

router.get("/", async (_req, res) => {
  const list = await prisma.notice.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: { author: { select: { name: true } } },
  });
  res.json({ notices: list });
});

const schema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  pinned: z.boolean().optional(),
});

router.post("/", async (req, res) => {
  const u = (req as any).user;
  if (!canWriteNotice(u?.role)) return res.status(403).json({ error: "forbidden" });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d = parsed.data;
  const n = await prisma.notice.create({
    data: { title: d.title, content: d.content, pinned: !!d.pinned, authorId: u.id },
  });
  await writeLog(u.id, "NOTICE_CREATE", n.id, d.title);
  // 작성자 본인에게도 알림이 가게 — 관리자 스스로 테스트/확인이 쉽도록.
  await notifyAllUsers({
    type: "NOTICE",
    title: d.pinned ? `📌 ${d.title}` : d.title,
    body: d.content.slice(0, 120),
    linkUrl: `/notice?id=${n.id}`,
    actorName: u.name,
  });
  res.json({ notice: n });
});

router.delete("/:id", async (req, res) => {
  const u = (req as any).user;
  if (!canWriteNotice(u?.role)) return res.status(403).json({ error: "forbidden" });
  await prisma.notice.delete({ where: { id: req.params.id } });
  await writeLog(u.id, "NOTICE_DELETE", req.params.id);
  res.json({ ok: true });
});

export default router;
