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
    take: 300,
    include: { author: { select: { name: true } } },
  });
  res.json({ notices: list });
});

const schema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20_000),
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
  // 작성자 본인은 방금 썼으니 알림 받지 않게 제외 — 관리자 벨이 본인 공지로 깜빡이지 않도록.
  await notifyAllUsers(
    {
      type: "NOTICE",
      title: d.pinned ? `📌 ${d.title}` : d.title,
      body: d.content.slice(0, 120),
      linkUrl: `/notice?id=${n.id}`,
      actorName: u.name,
    },
    u.id,
  );
  res.json({ notice: n });
});

// 공지 수정 — 작성 권한과 동일 (ADMIN/MANAGER). 알림 재발송은 하지 않음 (본문 오타 수정 등을
// 전사 알림으로 울리면 스팸처럼 느껴져서). 중요한 정정이 있으면 새 공지로 올리는 흐름 권장.
const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(20_000).optional(),
  pinned: z.boolean().optional(),
});

router.patch("/:id", async (req, res) => {
  const u = (req as any).user;
  if (!canWriteNotice(u?.role)) return res.status(403).json({ error: "forbidden" });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const notice = await prisma.notice.findUnique({ where: { id: req.params.id } });
  if (!notice) return res.status(404).json({ error: "not found" });
  // 작성자 본인이거나 ADMIN 역할이면 수정 가능. MANAGER 는 자신이 쓴 공지만 수정.
  if (u.role !== "ADMIN" && notice.authorId !== u.id) {
    return res.status(403).json({ error: "본인이 작성한 공지만 수정할 수 있습니다" });
  }
  const updated = await prisma.notice.update({
    where: { id: notice.id },
    data: parsed.data,
  });
  await writeLog(u.id, "NOTICE_UPDATE", notice.id, JSON.stringify(parsed.data));
  res.json({ notice: updated });
});

router.delete("/:id", async (req, res) => {
  const u = (req as any).user;
  if (!canWriteNotice(u?.role)) return res.status(403).json({ error: "forbidden" });
  const notice = await prisma.notice.findUnique({ where: { id: req.params.id } });
  if (!notice) return res.status(404).json({ error: "not found" });
  if (u.role !== "ADMIN" && notice.authorId !== u.id) {
    return res.status(403).json({ error: "본인이 작성한 공지만 삭제할 수 있습니다" });
  }
  await prisma.notice.delete({ where: { id: notice.id } });
  await writeLog(u.id, "NOTICE_DELETE", notice.id);
  res.json({ ok: true });
});

export default router;
