import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";
import { notify } from "../lib/notify.js";

const router = Router();
router.use(requireAuth);

const approvalSchema = z.object({
  type: z.enum(["TRIP", "EXPENSE", "PURCHASE", "GENERAL", "OFFSITE", "OTHER"]),
  title: z.string().min(1),
  content: z.string().optional(),
  data: z.any().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  amount: z.number().int().optional(),
  reviewerIds: z.array(z.string()).min(1),
});

router.get("/", async (req, res) => {
  const u = (req as any).user;
  const scope = String(req.query.scope ?? "mine"); // mine | pending | all
  const where: any = {};
  if (scope === "mine") where.requesterId = u.id;
  else if (scope === "pending") {
    // 내가 리뷰어이고, 아직 대기중이며 내 순번이 돌아온 것
    where.steps = { some: { reviewerId: u.id, status: "PENDING" } };
    where.status = "PENDING";
  }
  const list = await prisma.approval.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      requester: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, position: true, team: true } },
      steps: {
        orderBy: { order: "asc" },
        include: { reviewer: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } },
      },
    },
  });

  // 현재 차례(pending 중 첫 번째) 계산
  const decorated = list.map((a) => {
    const cur = a.steps.find((s) => s.status === "PENDING");
    return { ...a, currentStepOrder: cur?.order ?? null, currentReviewerId: cur?.reviewerId ?? null };
  });
  res.json({ approvals: decorated });
});

router.get("/:id", async (req, res) => {
  const u = (req as any).user;
  const a = await prisma.approval.findUnique({
    where: { id: req.params.id },
    include: {
      requester: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, position: true, team: true, email: true } },
      steps: {
        orderBy: { order: "asc" },
        include: { reviewer: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, position: true } } },
      },
    },
  });
  if (!a) return res.status(404).json({ error: "not found" });
  const canSee = a.requesterId === u.id || a.steps.some((s) => s.reviewerId === u.id) || u.role === "ADMIN";
  if (!canSee) return res.status(403).json({ error: "forbidden" });
  res.json({ approval: a });
});

router.post("/", async (req, res) => {
  const parsed = approvalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const d = parsed.data;

  const reviewers = Array.from(new Set(d.reviewerIds.filter((id) => id !== u.id)));
  if (!reviewers.length) return res.status(400).json({ error: "결재자를 1명 이상 선택해주세요" });

  const approval = await prisma.approval.create({
    data: {
      type: d.type,
      title: d.title,
      content: d.content,
      data: d.data ? JSON.stringify(d.data) : null,
      startDate: d.startDate ? new Date(d.startDate) : null,
      endDate: d.endDate ? new Date(d.endDate) : null,
      amount: d.amount,
      requesterId: u.id,
      steps: {
        create: reviewers.map((rid, idx) => ({ reviewerId: rid, order: idx + 1 })),
      },
    },
    include: { steps: true },
  });
  await writeLog(u.id, "APPROVAL_CREATE", approval.id, `${d.type}:${d.title}`);

  const first = approval.steps.find((s) => s.order === 1);
  if (first) {
    await notify({
      userId: first.reviewerId,
      type: "APPROVAL_REQUEST",
      title: `결재 요청 · ${labelForType(d.type)}`,
      body: d.title,
      linkUrl: `/approvals?id=${approval.id}`,
      actorName: u.name,
    });
  }

  res.json({ approval });
});

router.post("/:id/act", async (req, res) => {
  const u = (req as any).user;
  const action = String(req.body?.action ?? ""); // approve | reject
  const comment = req.body?.comment ? String(req.body.comment) : undefined;
  if (!["approve", "reject"].includes(action))
    return res.status(400).json({ error: "invalid action" });

  const a = await prisma.approval.findUnique({
    where: { id: req.params.id },
    include: { steps: { orderBy: { order: "asc" } } },
  });
  if (!a) return res.status(404).json({ error: "not found" });
  if (a.status !== "PENDING") return res.status(400).json({ error: "이미 종결된 결재입니다" });

  const currentStep = a.steps.find((s) => s.status === "PENDING");
  if (!currentStep) return res.status(400).json({ error: "처리할 단계가 없습니다" });
  if (currentStep.reviewerId !== u.id)
    return res.status(403).json({ error: "본인 차례가 아닙니다" });

  const newStatus = action === "approve" ? "APPROVED" : "REJECTED";
  await prisma.approvalStep.update({
    where: { id: currentStep.id },
    data: { status: newStatus, comment, actedAt: new Date() },
  });

  if (action === "reject") {
    await prisma.approval.update({ where: { id: a.id }, data: { status: "REJECTED" } });
    await notify({
      userId: a.requesterId,
      type: "APPROVAL_REVIEW",
      title: `결재 반려 · ${labelForType(a.type)}`,
      body: `${a.title}\n${comment ?? ""}`.trim(),
      linkUrl: `/approvals?id=${a.id}`,
      actorName: u.name,
    });
  } else {
    // approve → 다음 단계 알림 혹은 최종 승인
    const next = a.steps.find((s) => s.order > currentStep.order && s.status === "PENDING");
    if (next) {
      await notify({
        userId: next.reviewerId,
        type: "APPROVAL_REQUEST",
        title: `결재 요청 · ${labelForType(a.type)}`,
        body: a.title,
        linkUrl: `/approvals?id=${a.id}`,
        actorName: u.name,
      });
    } else {
      await prisma.approval.update({ where: { id: a.id }, data: { status: "APPROVED" } });
      await notify({
        userId: a.requesterId,
        type: "APPROVAL_REVIEW",
        title: `결재 승인 · ${labelForType(a.type)}`,
        body: a.title,
        linkUrl: `/approvals?id=${a.id}`,
        actorName: u.name,
      });
    }
  }

  await writeLog(u.id, `APPROVAL_${action.toUpperCase()}`, a.id, a.title);

  const refreshed = await prisma.approval.findUnique({
    where: { id: a.id },
    include: {
      requester: { select: { id: true, name: true } },
      steps: { orderBy: { order: "asc" }, include: { reviewer: { select: { id: true, name: true } } } },
    },
  });
  res.json({ approval: refreshed });
});

router.post("/:id/cancel", async (req, res) => {
  const u = (req as any).user;
  const a = await prisma.approval.findUnique({ where: { id: req.params.id } });
  if (!a) return res.status(404).json({ error: "not found" });
  if (a.requesterId !== u.id) return res.status(403).json({ error: "forbidden" });
  if (a.status !== "PENDING") return res.status(400).json({ error: "이미 종결되었습니다" });
  await prisma.approval.update({ where: { id: a.id }, data: { status: "CANCELED" } });
  await writeLog(u.id, "APPROVAL_CANCEL", a.id);
  res.json({ ok: true });
});

function labelForType(t: string) {
  return {
    TRIP: "출장 신청",
    OFFSITE: "외근 신청",
    EXPENSE: "지출결의",
    PURCHASE: "구매요청",
    GENERAL: "일반 품의",
    OTHER: "기타",
  }[t] ?? t;
}

export default router;
