import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { prisma } from "../lib/db.js";
import { requireAdmin, requireAuth, requireSuperAdmin, requireSuperAdminStepUp, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);

/* ===== 초대키 ===== */
router.get("/invites", async (_req, res) => {
  const keys = await prisma.inviteKey.findMany({
    orderBy: { createdAt: "desc" },
    include: { usedBy: { select: { name: true, email: true } } },
  });
  res.json({ keys });
});

const createKeySchema = z.object({
  email: z.string().email().optional().or(z.literal("")),
  name: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).default("MEMBER"),
  team: z.string().optional(),
  position: z.string().optional(),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

router.post("/invites", async (req, res) => {
  const parsed = createKeySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d = parsed.data;
  const u = (req as any).user;

  const key = `HN-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;

  const created = await prisma.inviteKey.create({
    data: {
      key,
      email: d.email || null,
      name: d.name || null,
      role: d.role,
      team: d.team || null,
      position: d.position || null,
      expiresAt: d.expiresInDays ? new Date(Date.now() + d.expiresInDays * 86400000) : null,
      createdById: u.id,
    },
  });
  await writeLog(u.id, "INVITE_CREATE", key, JSON.stringify(d));
  res.json({ key: created });
});

router.delete("/invites/:id", async (req, res) => {
  const u = (req as any).user;
  await prisma.inviteKey.delete({ where: { id: req.params.id } });
  await writeLog(u.id, "INVITE_DELETE", req.params.id);
  res.json({ ok: true });
});

/* ===== 유저 ===== */
// HR 상세까지 포함해 전 필드 반환. 엑셀 업/다운로드 기반.
const HR_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  team: true,
  position: true,
  active: true,
  avatarColor: true,
  createdAt: true,
  hrCode: true,
  affiliation: true,
  employeeNo: true,
  workplace: true,
  department: true,
  jobDuty: true,
  employmentType: true,
  employmentCategory: true,
  contractType: true,
  birthDate: true,
  gender: true,
  disabilityType: true,
  disabilityLevel: true,
  hireDate: true,
  phone: true,
  note: true,
} as const;

router.get("/users", async (req, res) => {
  const u = (req as any).user;
  const users = await prisma.user.findMany({
    where: u.superAdmin ? {} : { superAdmin: false }, // 일반 관리자에겐 총관리자 계정 은닉
    orderBy: { createdAt: "desc" },
    select: HR_SELECT,
  });
  res.json({ users });
});

const nullableStr = z.string().optional().nullable();
const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).optional(),
  team: nullableStr,
  position: nullableStr,
  active: z.boolean().optional(),
  name: z.string().optional(),
  hrCode: nullableStr,
  affiliation: nullableStr,
  employeeNo: nullableStr,
  workplace: nullableStr,
  department: nullableStr,
  jobDuty: nullableStr,
  employmentType: nullableStr,
  employmentCategory: nullableStr,
  contractType: nullableStr,
  birthDate: nullableStr,
  gender: nullableStr,
  disabilityType: nullableStr,
  disabilityLevel: nullableStr,
  hireDate: nullableStr,
  phone: nullableStr,
  note: nullableStr,
});

router.patch("/users/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;

  // 총관리자는 일반 관리자가 변경할 수 없음 — 404 처럼 위장해 존재를 노출하지 않음
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "not found" });
  if (target.superAdmin && !u.superAdmin) return res.status(404).json({ error: "not found" });

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: HR_SELECT,
  });
  await writeLog(u.id, "USER_UPDATE", req.params.id, JSON.stringify(parsed.data));
  res.json({ user: updated });
});

/* ===== 엑셀 일괄 업로드 — HR 필드 업서트 =====
 * 클라이언트에서 xlsx 파일 파싱 후 행 배열 전달.
 * 식별자: email(우선) 또는 employeeNo 또는 hrCode 중 먼저 매치되는 기존 유저를 업데이트.
 * 매치 안 되면 무시 (잘못된 비밀번호로 신규 유저 만들지 않음).
 */
const importRowSchema = z.object({
  email: z.string().optional(),
  hrCode: z.string().optional(),
  employeeNo: z.string().optional(),
  name: z.string().optional(),
  affiliation: z.string().optional(),
  workplace: z.string().optional(),
  department: z.string().optional(),
  jobDuty: z.string().optional(),
  position: z.string().optional(),
  employmentType: z.string().optional(),
  employmentCategory: z.string().optional(),
  contractType: z.string().optional(),
  birthDate: z.string().optional(),
  gender: z.string().optional(),
  disabilityType: z.string().optional(),
  disabilityLevel: z.string().optional(),
  hireDate: z.string().optional(),
  phone: z.string().optional(),
  note: z.string().optional(),
  team: z.string().optional(),
});
router.post("/users/import", async (req, res) => {
  const u = (req as any).user;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) return res.status(400).json({ error: "rows 배열이 필요합니다." });

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [i, raw] of rows.entries()) {
    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      skipped++;
      errors.push(`행 ${i + 2}: 형식 오류`);
      continue;
    }
    const d = parsed.data;
    // 식별자 순서: email → employeeNo → hrCode
    let target: { id: string; superAdmin: boolean } | null = null;
    if (d.email) target = await prisma.user.findUnique({ where: { email: d.email }, select: { id: true, superAdmin: true } });
    if (!target && d.employeeNo) target = await prisma.user.findFirst({ where: { employeeNo: d.employeeNo }, select: { id: true, superAdmin: true } });
    if (!target && d.hrCode) target = await prisma.user.findFirst({ where: { hrCode: d.hrCode }, select: { id: true, superAdmin: true } });
    if (!target) {
      skipped++;
      errors.push(`행 ${i + 2}: 일치하는 유저 없음 (email/사번/HR번호 중 하나 필요)`);
      continue;
    }
    if (target.superAdmin && !u.superAdmin) {
      skipped++;
      continue;
    }
    // undefined 값은 무시되도록 필터링
    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) {
      if (k === "email") continue; // 식별자로만 쓰고 변경은 안 함
      if (v !== undefined && v !== "") data[k] = v;
    }
    await prisma.user.update({ where: { id: target.id }, data });
    updated++;
  }
  await writeLog(u.id, "USER_IMPORT", "", JSON.stringify({ updated, skipped }));
  res.json({ updated, skipped, errors: errors.slice(0, 20) });
});

router.delete("/users/:id", async (req, res) => {
  const u = (req as any).user;
  if (req.params.id === u.id) return res.status(400).json({ error: "본인은 삭제할 수 없습니다" });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "not found" });
  if (target.superAdmin && !u.superAdmin) return res.status(404).json({ error: "not found" });

  await prisma.user.delete({ where: { id: req.params.id } });
  await writeLog(u.id, "USER_DELETE", req.params.id);
  res.json({ ok: true });
});

/* ===== 팀 ===== */
router.get("/teams", async (_req, res) => {
  const teams = await prisma.team.findMany({ orderBy: { createdAt: "asc" } });
  res.json({ teams });
});

router.post("/teams", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "이름을 입력해주세요" });
  const u = (req as any).user;
  try {
    const team = await prisma.team.create({ data: { name } });
    await writeLog(u.id, "TEAM_CREATE", team.id, name);
    res.json({ team });
  } catch (e: any) {
    if (e?.code === "P2002") return res.status(400).json({ error: "이미 존재하는 팀" });
    throw e;
  }
});

router.patch("/teams/:id", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  if (!name) return res.status(400).json({ error: "이름을 입력해주세요" });
  const u = (req as any).user;
  const prev = await prisma.team.findUnique({ where: { id: req.params.id } });
  if (!prev) return res.status(404).json({ error: "not found" });
  const team = await prisma.team.update({ where: { id: prev.id }, data: { name } });
  // 사용자 team 문자열도 동기화
  if (prev.name !== name) {
    await prisma.user.updateMany({ where: { team: prev.name }, data: { team } });
  }
  await writeLog(u.id, "TEAM_UPDATE", team.id, `${prev.name} -> ${name}`);
  res.json({ team });
});

router.delete("/teams/:id", async (req, res) => {
  const u = (req as any).user;
  const team = await prisma.team.findUnique({ where: { id: req.params.id } });
  if (!team) return res.status(404).json({ error: "not found" });
  await prisma.team.delete({ where: { id: team.id } });
  await writeLog(u.id, "TEAM_DELETE", team.id, team.name);
  res.json({ ok: true });
});

/* ===== 직급 ===== */
router.get("/positions", async (_req, res) => {
  const positions = await prisma.position.findMany({ orderBy: [{ rank: "asc" }, { createdAt: "asc" }] });
  res.json({ positions });
});

router.post("/positions", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const rank = Number(req.body?.rank ?? 0);
  if (!name) return res.status(400).json({ error: "이름을 입력해주세요" });
  const u = (req as any).user;
  try {
    const position = await prisma.position.create({ data: { name, rank } });
    await writeLog(u.id, "POSITION_CREATE", position.id, name);
    res.json({ position });
  } catch (e: any) {
    if (e?.code === "P2002") return res.status(400).json({ error: "이미 존재하는 직급" });
    throw e;
  }
});

router.patch("/positions/:id", async (req, res) => {
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
  const rank = req.body?.rank !== undefined ? Number(req.body.rank) : undefined;
  const u = (req as any).user;
  const prev = await prisma.position.findUnique({ where: { id: req.params.id } });
  if (!prev) return res.status(404).json({ error: "not found" });
  const position = await prisma.position.update({
    where: { id: prev.id },
    data: { ...(name !== undefined && { name }), ...(rank !== undefined && { rank }) },
  });
  if (name && prev.name !== name) {
    await prisma.user.updateMany({ where: { position: prev.name }, data: { position: name } });
  }
  await writeLog(u.id, "POSITION_UPDATE", position.id, `${prev.name} -> ${name ?? prev.name}`);
  res.json({ position });
});

router.delete("/positions/:id", async (req, res) => {
  const u = (req as any).user;
  const position = await prisma.position.findUnique({ where: { id: req.params.id } });
  if (!position) return res.status(404).json({ error: "not found" });
  await prisma.position.delete({ where: { id: position.id } });
  await writeLog(u.id, "POSITION_DELETE", position.id, position.name);
  res.json({ ok: true });
});

/* ===== 로그 (총관리자 전용 · step-up 필요) ===== */
router.get("/logs", requireSuperAdminStepUp, async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
  res.json({ logs });
});

/* ===== 출근 기록 조회 — 특정 유저의 특정 날짜 ===== */
router.get("/users/:id/attendance", async (req, res) => {
  const { id } = req.params;
  const d = new Date();
  const defaultDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const qdate = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : defaultDate;
  const rec = await prisma.attendance.findUnique({
    where: { userId_date: { userId: id, date: qdate } },
  });
  res.json({ attendance: rec });
});

/* ===== 출근 기록 관리 — 특정 유저의 특정 날짜 출퇴근 시각 수정 ===== */
// body: { date?: "YYYY-MM-DD" 생략시 오늘, checkIn?: ISO|null, checkOut?: ISO|null }
// 문자열 생략 → 미변경, null 명시 → 해당 필드 지움.
router.patch("/users/:id/attendance", async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return res.status(404).json({ error: "not found" });
  const body = req.body ?? {};
  const d = new Date();
  const defaultDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : defaultDate;
  const parseTime = (v: unknown): Date | null | undefined => {
    if (v === null) return null;
    if (typeof v !== "string" || !v) return undefined;
    const dt = new Date(v);
    return isNaN(dt.getTime()) ? undefined : dt;
  };
  const checkIn = parseTime(body.checkIn);
  const checkOut = parseTime(body.checkOut);
  const data: { checkIn?: Date | null; checkOut?: Date | null } = {};
  if (checkIn !== undefined) data.checkIn = checkIn;
  if (checkOut !== undefined) data.checkOut = checkOut;
  const rec = await prisma.attendance.upsert({
    where: { userId_date: { userId: id, date } },
    update: data,
    create: { userId: id, date, checkIn: checkIn ?? null, checkOut: checkOut ?? null },
  });
  res.json({ attendance: rec });
});

export default router;
