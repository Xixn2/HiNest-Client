import { Router } from "express";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { todayStr } from "../lib/dates.js";

const router = Router();
router.use(requireAuth);

// 팀원 목록 (일반 유저도 볼 수 있음) — 총관리자는 자신 외엔 보이지 않음
// 업무 상태(presence) + 오늘 출퇴근 요약 포함

router.get("/", async (req, res) => {
  const u = (req as any).user;
  const users = await prisma.user.findMany({
    where: {
      active: true,
      OR: [{ superAdmin: false }, { id: u.id }],
    },
    orderBy: { name: "asc" },
    take: 5000,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      team: true,
      position: true,
      avatarColor: true,
      avatarUrl: true,
      isDeveloper: true,
      presenceStatus: true,
      presenceMessage: true,
      presenceUpdatedAt: true,
    },
  });
  const date = todayStr();
  const ids = users.map((u) => u.id);
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);

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
  const priority: Record<string, number> = { TRIP: 3, HALF: 2, ANNUAL: 1, SICK: 1, OTHER: 1 };
  const leaveMap = new Map<string, string>();
  for (const l of leaves) {
    const prev = leaveMap.get(l.userId);
    if (!prev || (priority[l.type] ?? 0) > (priority[prev] ?? 0)) leaveMap.set(l.userId, l.type);
  }

  const enriched = users.map((x) => {
    const a = attMap.get(x.id);
    const leaveType = leaveMap.get(x.id);
    let workStatus: "IN" | "OFF" | "NONE" | "LEAVE" | "HALF_LEAVE" | "TRIP";
    if (leaveType === "TRIP") workStatus = "TRIP";
    else if (leaveType === "HALF") workStatus = "HALF_LEAVE";
    else if (leaveType) workStatus = "LEAVE";
    else workStatus = a?.checkOut ? "OFF" : a?.checkIn ? "IN" : "NONE";
    return { ...x, workStatus, checkIn: a?.checkIn ?? null, checkOut: a?.checkOut ?? null, leaveType: leaveType ?? null };
  });

  // 전체 목록은 30초간 브라우저 캐시 허용. presenceStatus 는 SSE 로 실시간 업데이트되므로 괜찮음.
  res.setHeader("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  res.json({ users: enriched });
});

/**
 * 경량 Presence 전용 엔드포인트 — ChatMiniApp 이 30초마다 폴링할 때 사용.
 * 전체 유저 목록 대신 id + presenceStatus + workStatus 만 반환 → 응답 크기 ~8x 감소.
 */
router.get("/presence", async (_req, res) => {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday); endOfToday.setDate(endOfToday.getDate() + 1);
  const date = todayStr();

  const [users, attendances, leaves] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, superAdmin: false },
      select: { id: true, presenceStatus: true, presenceMessage: true },
      take: 5000,
    }),
    prisma.attendance.findMany({
      where: { date },
      select: { userId: true, checkIn: true, checkOut: true },
    }),
    prisma.leave.findMany({
      where: {
        status: "APPROVED",
        startDate: { lt: endOfToday },
        endDate: { gte: startOfToday },
      },
      select: { userId: true, type: true },
    }),
  ]);

  const attMap = new Map(attendances.map((a) => [a.userId, a]));
  const priority: Record<string, number> = { TRIP: 3, HALF: 2, ANNUAL: 1, SICK: 1, OTHER: 1 };
  const leaveMap = new Map<string, string>();
  for (const l of leaves) {
    const prev = leaveMap.get(l.userId);
    if (!prev || (priority[l.type] ?? 0) > (priority[prev] ?? 0)) leaveMap.set(l.userId, l.type);
  }

  const result = users.map((x) => {
    const a = attMap.get(x.id);
    const lt = leaveMap.get(x.id);
    let workStatus: string;
    if (lt === "TRIP") workStatus = "TRIP";
    else if (lt === "HALF") workStatus = "HALF_LEAVE";
    else if (lt) workStatus = "LEAVE";
    else workStatus = a?.checkOut ? "OFF" : a?.checkIn ? "IN" : "NONE";
    return { id: x.id, presenceStatus: x.presenceStatus, presenceMessage: x.presenceMessage, workStatus };
  });

  res.setHeader("Cache-Control", "private, max-age=15, stale-while-revalidate=30");
  res.json({ users: result });
});

// 팀 목록 — 60초 in-process 캐시. 팀 목록은 관리자가 유저를 편집할 때만 바뀜.
let _teamsCache: { teams: string[]; exp: number } | null = null;

router.get("/teams", async (_req, res) => {
  if (_teamsCache && _teamsCache.exp > Date.now()) {
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.json({ teams: _teamsCache.teams });
  }
  const rows = await prisma.user.findMany({
    where: { team: { not: null }, active: true },
    select: { team: true },
    distinct: ["team"],
  });
  const teams = rows.map((r) => r.team).filter(Boolean) as string[];
  _teamsCache = { teams, exp: Date.now() + 60_000 };
  res.setHeader("Cache-Control", "private, max-age=60");
  res.json({ teams });
});

export function invalidateTeamsCache() {
  _teamsCache = null;
}

export default router;
