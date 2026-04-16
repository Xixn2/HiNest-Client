import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const u = (req as any).user;
  const meUser = await prisma.user.findUnique({ where: { id: u.id } });
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;

  const where: any = {
    OR: [
      { scope: "COMPANY" },
      { scope: "TEAM", team: meUser?.team ?? "" },
      { scope: "PERSONAL", createdBy: u.id },
    ],
  };
  if (from || to) {
    where.AND = [];
    if (from) where.AND.push({ endAt: { gte: from } });
    if (to) where.AND.push({ startAt: { lte: to } });
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { startAt: "asc" },
    include: { author: { select: { name: true } } },
  });
  res.json({ events });
});

const eventSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  scope: z.enum(["COMPANY", "TEAM", "PERSONAL"]).default("PERSONAL"),
  team: z.string().optional().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  color: z.string().optional(),
});

router.post("/", async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const d = parsed.data;

  if (d.scope === "COMPANY" && u.role === "MEMBER")
    return res.status(403).json({ error: "전사 일정은 관리자/매니저만 등록 가능" });

  const ev = await prisma.event.create({
    data: {
      title: d.title,
      content: d.content,
      scope: d.scope,
      team: d.team ?? null,
      startAt: new Date(d.startAt),
      endAt: new Date(d.endAt),
      color: d.color ?? "#36D7B7",
      createdBy: u.id,
    },
  });
  await writeLog(u.id, "EVENT_CREATE", ev.id, d.title);
  res.json({ event: ev });
});

router.delete("/:id", async (req, res) => {
  const u = (req as any).user;
  const ev = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!ev) return res.status(404).json({ error: "not found" });
  if (ev.createdBy !== u.id && u.role !== "ADMIN")
    return res.status(403).json({ error: "forbidden" });
  await prisma.event.delete({ where: { id: ev.id } });
  await writeLog(u.id, "EVENT_DELETE", ev.id);
  res.json({ ok: true });
});

export default router;
