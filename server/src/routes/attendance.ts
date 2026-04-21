import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";
import { todayStr } from "../lib/dates.js";

const router = Router();
router.use(requireAuth);

// 오늘 출퇴근 상태
router.get("/today", async (req, res) => {
  const u = (req as any).user;
  const rec = await prisma.attendance.findUnique({
    where: { userId_date: { userId: u.id, date: todayStr() } },
  });
  res.json({ attendance: rec });
});

// 출근 — 하루에 여러 번 가능. 외근/복귀 등으로 재출근 찍는 경우 대응.
// checkIn 은 항상 최신 시각으로 덮어쓰고, checkOut 은 초기화 (새 근무 시작으로 간주).
router.post("/check-in", async (req, res) => {
  const u = (req as any).user;
  const date = todayStr();
  const rec = await prisma.attendance.upsert({
    where: { userId_date: { userId: u.id, date } },
    update: { checkIn: new Date(), checkOut: null },
    create: { userId: u.id, date, checkIn: new Date() },
  });
  await writeLog(u.id, "CHECK_IN", date);
  res.json({ attendance: rec });
});

// 퇴근
// 출근 기록 없이 퇴근 눌러도 500 나지 않도록 upsert.
// (앱 재설치 직후, 새벽 경계 타이밍, 관리자 수동 조정 등 엣지 케이스 대응)
// create 시 checkIn 은 null 로 두고 checkOut 만 기록 — 리포트에서 "출근 누락 후 퇴근" 으로 보임.
router.post("/check-out", async (req, res) => {
  const u = (req as any).user;
  const date = todayStr();
  const now = new Date();
  const rec = await prisma.attendance.upsert({
    where: { userId_date: { userId: u.id, date } },
    update: { checkOut: now },
    create: { userId: u.id, date, checkOut: now },
  });
  await writeLog(u.id, "CHECK_OUT", date);
  res.json({ attendance: rec });
});

// 월별 근태 기록
router.get("/month", async (req, res) => {
  const u = (req as any).user;
  const month = String(req.query.month ?? ""); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "month=YYYY-MM" });
  const prefix = month + "-";
  const list = await prisma.attendance.findMany({
    where: { userId: u.id, date: { startsWith: prefix } },
    orderBy: { date: "asc" },
  });
  res.json({ attendances: list });
});

// 휴가 신청
// TRIP = 외근 (출장/외부 미팅 등 — 사무실 밖에서 업무).
const leaveSchema = z.object({
  type: z.enum(["ANNUAL", "HALF", "SICK", "TRIP", "OTHER"]),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().optional(),
});

router.post("/leave", async (req, res) => {
  const parsed = leaveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const d = parsed.data;
  const leave = await prisma.leave.create({
    data: {
      userId: u.id,
      type: d.type,
      startDate: new Date(d.startDate),
      endDate: new Date(d.endDate),
      reason: d.reason,
    },
  });
  await writeLog(u.id, "LEAVE_REQUEST", leave.id, d.type);
  res.json({ leave });
});

router.get("/leave", async (req, res) => {
  const u = (req as any).user;
  const all = req.query.all === "1" && (u.role === "ADMIN" || u.role === "MANAGER");
  const leaves = await prisma.leave.findMany({
    where: all ? {} : { userId: u.id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, team: true } } },
  });
  res.json({ leaves });
});

router.patch("/leave/:id", async (req, res) => {
  const u = (req as any).user;
  if (u.role !== "ADMIN" && u.role !== "MANAGER")
    return res.status(403).json({ error: "forbidden" });
  const status = req.body?.status;
  if (!["APPROVED", "REJECTED", "PENDING"].includes(status))
    return res.status(400).json({ error: "invalid status" });
  const leave = await prisma.leave.update({
    where: { id: req.params.id },
    data: { status, reviewer: u.id },
  });
  await writeLog(u.id, "LEAVE_REVIEW", leave.id, status);
  res.json({ leave });
});

export default router;
