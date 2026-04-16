import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

const schema = z.object({
  usedAt: z.string(),
  merchant: z.string().min(1),
  category: z.string().min(1),
  amount: z.number().int().nonnegative(),
  memo: z.string().optional(),
  receiptUrl: z.string().optional(),
});

// 목록
router.get("/", async (req, res) => {
  const u = (req as any).user;
  const all = req.query.all === "1" && (u.role === "ADMIN" || u.role === "MANAGER");
  const month = req.query.month ? String(req.query.month) : undefined;

  const where: any = all ? {} : { userId: u.id };
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split("-").map(Number);
    where.usedAt = {
      gte: new Date(y, m - 1, 1),
      lt: new Date(y, m, 1),
    };
  }
  const list = await prisma.cardExpense.findMany({
    where,
    orderBy: { usedAt: "desc" },
    include: { user: { select: { name: true, team: true } } },
  });
  const totalAmount = list.reduce((s, x) => s + x.amount, 0);
  res.json({ expenses: list, totalAmount });
});

router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const d = parsed.data;
  const e = await prisma.cardExpense.create({
    data: {
      userId: u.id,
      usedAt: new Date(d.usedAt),
      merchant: d.merchant,
      category: d.category,
      amount: d.amount,
      memo: d.memo,
      receiptUrl: d.receiptUrl,
    },
  });
  await writeLog(u.id, "EXPENSE_CREATE", e.id, `${d.merchant} ${d.amount}원`);
  res.json({ expense: e });
});

router.patch("/:id", async (req, res) => {
  const u = (req as any).user;
  const exist = await prisma.cardExpense.findUnique({ where: { id: req.params.id } });
  if (!exist) return res.status(404).json({ error: "not found" });

  const body = req.body ?? {};

  if (body.status && (u.role === "ADMIN" || u.role === "MANAGER")) {
    if (!["PENDING", "APPROVED", "REJECTED"].includes(body.status))
      return res.status(400).json({ error: "invalid status" });
    const updated = await prisma.cardExpense.update({
      where: { id: exist.id },
      data: { status: body.status, reviewer: u.id },
    });
    await writeLog(u.id, "EXPENSE_REVIEW", exist.id, body.status);
    return res.json({ expense: updated });
  }

  if (exist.userId !== u.id) return res.status(403).json({ error: "forbidden" });
  const parsed = schema.partial().safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d = parsed.data;
  const updated = await prisma.cardExpense.update({
    where: { id: exist.id },
    data: {
      ...(d.usedAt && { usedAt: new Date(d.usedAt) }),
      ...(d.merchant && { merchant: d.merchant }),
      ...(d.category && { category: d.category }),
      ...(d.amount !== undefined && { amount: d.amount }),
      ...(d.memo !== undefined && { memo: d.memo }),
      ...(d.receiptUrl !== undefined && { receiptUrl: d.receiptUrl }),
    },
  });
  await writeLog(u.id, "EXPENSE_UPDATE", exist.id);
  res.json({ expense: updated });
});

router.delete("/:id", async (req, res) => {
  const u = (req as any).user;
  const exist = await prisma.cardExpense.findUnique({ where: { id: req.params.id } });
  if (!exist) return res.status(404).json({ error: "not found" });
  if (exist.userId !== u.id && u.role !== "ADMIN")
    return res.status(403).json({ error: "forbidden" });
  await prisma.cardExpense.delete({ where: { id: exist.id } });
  await writeLog(u.id, "EXPENSE_DELETE", exist.id);
  res.json({ ok: true });
});

export default router;
