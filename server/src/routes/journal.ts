import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

const schema = z.object({
  date: z.string().max(40),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(20_000),
});

// partial 이지만 빈 문자열 overwrite 는 막아야 함 — .partial() 만 쓰면 ""로 title 덮기 가능.
const patchSchema = z.object({
  date: z.string().max(40).optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(20_000).optional(),
});

router.get("/", async (req, res) => {
  const u = (req as any).user;
  const userId = req.query.userId ? String(req.query.userId) : u.id;
  if (userId !== u.id && u.role === "MEMBER")
    return res.status(403).json({ error: "forbidden" });
  const list = await prisma.journal.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 500,
    include: { user: { select: { name: true } } },
  });
  res.json({ journals: list });
});

router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const d = parsed.data;
  const j = await prisma.journal.create({
    data: { userId: u.id, date: d.date, title: d.title, content: d.content },
  });
  await writeLog(u.id, "JOURNAL_CREATE", j.id, d.date);
  res.json({ journal: j });
});

router.patch("/:id", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const j = await prisma.journal.findUnique({ where: { id: req.params.id } });
  if (!j) return res.status(404).json({ error: "not found" });
  if (j.userId !== u.id) return res.status(403).json({ error: "forbidden" });
  const updated = await prisma.journal.update({
    where: { id: j.id },
    data: parsed.data,
  });
  await writeLog(u.id, "JOURNAL_UPDATE", j.id);
  res.json({ journal: updated });
});

router.delete("/:id", async (req, res) => {
  const u = (req as any).user;
  const j = await prisma.journal.findUnique({ where: { id: req.params.id } });
  if (!j) return res.status(404).json({ error: "not found" });
  if (j.userId !== u.id && u.role !== "ADMIN")
    return res.status(403).json({ error: "forbidden" });
  await prisma.journal.delete({ where: { id: j.id } });
  await writeLog(u.id, "JOURNAL_DELETE", j.id);
  res.json({ ok: true });
});

export default router;
