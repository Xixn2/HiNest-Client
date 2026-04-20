import { Router } from "express";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// 팀원 목록 (일반 유저도 볼 수 있음) — 총관리자는 자신 외엔 보이지 않음
// 업무 상태(presence) + 오늘 출퇴근 요약 포함
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

router.get("/", async (req, res) => {
  const u = (req as any).user;
  const users = await prisma.user.findMany({
    where: {
      active: true,
      OR: [{ superAdmin: false }, { id: u.id }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      team: true,
      position: true,
      avatarColor: true,
      presenceStatus: true,
      presenceMessage: true,
      presenceUpdatedAt: true,
    },
  });
  const date = todayStr();
  const ids = users.map((u) => u.id);
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);

  // attendances 와 leaves 는 users 배열에만 의존 — 병렬로 던져서 왕복 절약.
  const [attendances, leaves] = await Promise.all([
    prisma.attendance.findMany({
      where: { date, userId: { in: ids } },
      select: { userId: true, checkIn: true, checkOut: true },
    }),
    prisma.leave.findMany({
      where: {
        status: "APPROVED",
        userId: { in: ids },
        startDate: { lt: endOfToday },
        endDate: { gte: startOfToday },
      },
      select: { userId: true, type: true },
    }),
  ]);
  const attMap = new Map(attendances.map((a) => [a.userId, a]));
  // 우선순위: TRIP > HALF > ANNUAL/SICK/OTHER (외근이 가장 구체적인 "업무중" 신호)
  const priority: Record<string, number> = { TRIP: 3, HALF: 2, ANNUAL: 1, SICK: 1, OTHER: 1 };
  const leaveMap = new Map<string, string>();
  for (const l of leaves) {
    const prev = leaveMap.get(l.userId);
    if (!prev || (priority[l.type] ?? 0) > (priority[prev] ?? 0)) leaveMap.set(l.userId, l.type);
  }

  const enriched = users.map((x) => {
    const a = attMap.get(x.id);
    const leaveType = leaveMap.get(x.id);
    // workStatus 우선순위: 휴가/외근 > 출퇴근 기록
    // TRIP → "TRIP" (외근), HALF → "HALF_LEAVE" (반차, 오전/오후 구분 없이), 그 외 → "LEAVE"
    let workStatus: "IN" | "OFF" | "NONE" | "LEAVE" | "HALF_LEAVE" | "TRIP";
    if (leaveType === "TRIP") workStatus = "TRIP";
    else if (leaveType === "HALF") workStatus = "HALF_LEAVE";
    else if (leaveType) workStatus = "LEAVE";
    else workStatus = a?.checkOut ? "OFF" : a?.checkIn ? "IN" : "NONE";
    return {
      ...x,
      workStatus,
      checkIn: a?.checkIn ?? null,
      checkOut: a?.checkOut ?? null,
      leaveType: leaveType ?? null,
    };
  });
  res.json({ users: enriched });
});

// 팀 목록
router.get("/teams", async (_req, res) => {
  const rows = await prisma.user.findMany({
    where: { team: { not: null }, active: true },
    select: { team: true },
    distinct: ["team"],
  });
  res.json({ teams: rows.map((r) => r.team).filter(Boolean) });
});

export default router;
