import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db.js";
import { requireAdmin, requireAuth, requireSuperAdminStepUp, verifySuperToken, writeLog, evictUserCache } from "../lib/auth.js";
import { todayStr } from "../lib/dates.js";

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
  email: z.string().email().max(200).optional().or(z.literal("")),
  name: z.string().max(200).optional(),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).default("MEMBER"),
  team: z.string().max(80).optional(),
  position: z.string().max(80).optional(),
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
  resignedAt: true,
  avatarColor: true,
  avatarUrl: true,
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
  autoClockOutTime: true,
} as const;

router.get("/users", async (req, res) => {
  const u = (req as any).user;
  // 상한 5000 — 엑셀 업로드 상한과 맞춤. 조직이 더 커지면 cursor pagination 으로 전환.
  const users = await prisma.user.findMany({
    where: u.superAdmin ? {} : { superAdmin: false }, // 일반 관리자에겐 총관리자 계정 은닉
    orderBy: { createdAt: "desc" },
    select: HR_SELECT,
    take: 5000,
  });
  res.json({ users });
});

// HR 필드 전반은 짧은 ID/코드/라벨 성격이므로 500자면 충분.
// note 만 자유 메모라 5000자까지 허용. 둘 다 DoS 방지 + DB 컬럼 오남용 차단용 상한.
const nullableStr = z.string().max(500).optional().nullable();
const noteStr = z.string().max(5_000).optional().nullable();
const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]).optional(),
  team: nullableStr,
  position: nullableStr,
  active: z.boolean().optional(),
  name: z.string().max(200).optional(),
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
  note: noteStr,
  // 자동 퇴근 시간 — "HH:mm" 형식. 빈 문자열이면 null 로 저장해 자동 퇴근 해제.
  autoClockOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm 형식").optional().nullable()
    .or(z.literal("")),
});

router.patch("/users/:id", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;

  // 총관리자는 일반 관리자가 변경할 수 없음 — 404 처럼 위장해 존재를 노출하지 않음
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "not found" });
  if (target.superAdmin && !u.superAdmin) return res.status(404).json({ error: "not found" });

  const data = parsed.data;

  // 빈 문자열 "" 는 null 로 정규화 — DB 에 저장되면 "자동 퇴근 미설정" 으로 해석됨.
  if (data.autoClockOutTime === "") {
    (data as any).autoClockOutTime = null;
  }

  // 역할 변경은 민감한 권한 에스컬레이션 경로. superAdmin + step-up 쿠키가 있어야 허용.
  // ADMIN 이 자신 또는 동료의 role 을 임의로 바꿀 수 없게 함.
  const isRoleChange = data.role !== undefined && data.role !== target.role;
  if (isRoleChange) {
    if (!u.superAdmin) {
      return res.status(403).json({ error: "역할 변경 권한이 없습니다 (총관리자 전용)" });
    }
    const v = verifySuperToken(req, u.id);
    if (!v) {
      return res.status(401).json({
        error: "역할 변경 전에 비밀번호 재확인이 필요합니다",
        code: "SUPER_STEPUP_REQUIRED",
      });
    }
    // 본인 역할 강등은 사고 방지용 차단 — 필요하면 다른 총관리자가 처리.
    if (target.id === u.id) {
      return res.status(400).json({ error: "본인 역할은 변경할 수 없습니다" });
    }
  }

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: HR_SELECT,
  });
  // 권한/활성 상태 변경 시 캐시된 세션 정보를 즉시 무효화해야 함 (30s TTL 대기 없이 즉시 반영)
  evictUserCache(req.params.id);
  await writeLog(
    u.id,
    isRoleChange ? "USER_ROLE_CHANGE" : "USER_UPDATE",
    req.params.id,
    JSON.stringify(data)
  );
  res.json({ user: updated });
});

/* ===== 엑셀 일괄 업로드 — HR 필드 업서트 =====
 * 클라이언트에서 xlsx 파일 파싱 후 행 배열 전달.
 * 식별자: email(우선) 또는 employeeNo 또는 hrCode 중 먼저 매치되는 기존 유저를 업데이트.
 * 매치 안 되면 무시 (잘못된 비밀번호로 신규 유저 만들지 않음).
 */
// 업데이트 스키마와 동일한 상한 적용 — 한 행이 거대한 페이로드를 숨기지 못하도록.
const importShortStr = z.string().max(500).optional();
const importNoteStr = z.string().max(5_000).optional();
const importRowSchema = z.object({
  email: z.string().max(200).optional(),
  hrCode: importShortStr,
  employeeNo: importShortStr,
  name: z.string().max(200).optional(),
  affiliation: importShortStr,
  workplace: importShortStr,
  department: importShortStr,
  jobDuty: importShortStr,
  position: importShortStr,
  employmentType: importShortStr,
  employmentCategory: importShortStr,
  contractType: importShortStr,
  birthDate: importShortStr,
  gender: importShortStr,
  disabilityType: importShortStr,
  disabilityLevel: importShortStr,
  hireDate: importShortStr,
  phone: importShortStr,
  note: importNoteStr,
  team: importShortStr,
});
/** 1회 import 최대 행 수 — DoS 방지용 상한. 실무상 넉넉한 5000. */
const IMPORT_MAX_ROWS = 5000;

router.post("/users/import", async (req, res) => {
  const u = (req as any).user;
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : null;
  if (!rows) return res.status(400).json({ error: "rows 배열이 필요합니다." });
  if (rows.length > IMPORT_MAX_ROWS) {
    return res.status(413).json({
      error: `한 번에 업로드 가능한 최대 행 수(${IMPORT_MAX_ROWS})를 초과했습니다. 나눠서 업로드해 주세요.`,
    });
  }

  // 성능 개선 (N+1 → 상수 쿼리):
  // 기존엔 5000 rows × up to 3 (email/employeeNo/hrCode) lookup = 최대 15,000 개의 DB 왕복.
  // 이제는 가능한 모든 식별자를 한 번에 모아 3회의 findMany 로 해결.
  // update 는 여전히 row 당 1회 유지 (데이터 일관성 · 오류 추적 목적).
  const emailsSet = new Set<string>();
  const empNosSet = new Set<string>();
  const hrCodesSet = new Set<string>();
  for (const raw of rows) {
    if (raw?.email) emailsSet.add(String(raw.email));
    if (raw?.employeeNo) empNosSet.add(String(raw.employeeNo));
    if (raw?.hrCode) hrCodesSet.add(String(raw.hrCode));
  }

  const [byEmail, byEmpNo, byHrCode] = await Promise.all([
    emailsSet.size
      ? prisma.user.findMany({
          where: { email: { in: [...emailsSet] } },
          select: { id: true, email: true, superAdmin: true },
        })
      : Promise.resolve([] as { id: string; email: string; superAdmin: boolean }[]),
    empNosSet.size
      ? prisma.user.findMany({
          where: { employeeNo: { in: [...empNosSet] } },
          select: { id: true, employeeNo: true, superAdmin: true },
        })
      : Promise.resolve([] as { id: string; employeeNo: string | null; superAdmin: boolean }[]),
    hrCodesSet.size
      ? prisma.user.findMany({
          where: { hrCode: { in: [...hrCodesSet] } },
          select: { id: true, hrCode: true, superAdmin: true },
        })
      : Promise.resolve([] as { id: string; hrCode: string | null; superAdmin: boolean }[]),
  ]);
  const emailMap = new Map(byEmail.map((x) => [x.email, { id: x.id, superAdmin: x.superAdmin }]));
  const empNoMap = new Map(
    byEmpNo.filter((x) => x.employeeNo).map((x) => [x.employeeNo as string, { id: x.id, superAdmin: x.superAdmin }])
  );
  const hrCodeMap = new Map(
    byHrCode.filter((x) => x.hrCode).map((x) => [x.hrCode as string, { id: x.id, superAdmin: x.superAdmin }])
  );

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
    let target: { id: string; superAdmin: boolean } | undefined;
    if (d.email) target = emailMap.get(d.email);
    if (!target && d.employeeNo) target = empNoMap.get(d.employeeNo);
    if (!target && d.hrCode) target = hrCodeMap.get(d.hrCode);
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

/* ===== 퇴사 처리 =====
 * 구성원을 퇴사로 표시하고 로그인을 즉시 차단한다.
 *
 * 보안 정책:
 *  - 관리자가 자기 자신의 비밀번호를 한 번 더 입력해야 처리 가능 (계정 탈취·실수 방지 step-up).
 *  - 총관리자 계정은 일반 관리자가 건드릴 수 없음 (기존 PATCH 와 동일 정책).
 *  - 본인 퇴사는 불가 — 관리자 본인이 사고로 자기 로그인을 막는 상황을 차단.
 *
 * 동작:
 *  - resignedAt 에 퇴사일(관리자가 캘린더에서 고른 YYYY-MM-DD) 저장.
 *  - active=false 로 설정 → 로그인 로직(auth.ts) 이 user.active 로 가드하므로 바로 차단됨.
 */
const resignSchema = z.object({
  // 관리자의 현재 계정 비밀번호 (step-up 재확인)
  password: z.string().min(1).max(128),
  // 퇴사일 — "YYYY-MM-DD" 문자열. 빈 값이면 오늘 날짜로.
  resignedAt: z.string().max(40).optional(),
});

router.post("/users/:id/resign", async (req, res) => {
  const u = (req as any).user;
  const parsed = resignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });

  if (req.params.id === u.id) {
    return res.status(400).json({ error: "본인 계정은 퇴사 처리할 수 없습니다" });
  }

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "not found" });
  if (target.superAdmin && !u.superAdmin) return res.status(404).json({ error: "not found" });

  // 관리자 본인 비밀번호 재확인 — 잘못된 재확인을 attacker 가 폭주시키지 못하게 bcrypt.compare 자체가 slow.
  const me = await prisma.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
  if (!me) return res.status(401).json({ error: "세션이 유효하지 않습니다" });
  const ok = await bcrypt.compare(parsed.data.password, me.passwordHash);
  if (!ok) {
    await writeLog(u.id, "USER_RESIGN_FAIL", req.params.id, "bad_password");
    return res.status(401).json({ error: "비밀번호가 올바르지 않습니다", code: "BAD_PASSWORD" });
  }

  // 날짜 파싱 — 빈 값이면 지금 시각. YYYY-MM-DD 는 자정(로컬) 기준으로 해석.
  let when: Date;
  if (parsed.data.resignedAt) {
    const s = parsed.data.resignedAt;
    // ISO 혹은 YYYY-MM-DD 둘 다 허용
    when = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ error: "퇴사일 형식이 올바르지 않습니다" });
    }
  } else {
    when = new Date();
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { resignedAt: when, active: false },
    select: HR_SELECT,
  });
  evictUserCache(target.id);
  await writeLog(u.id, "USER_RESIGN", target.id, `at=${when.toISOString()}`);
  res.json({ user: updated });
});

/**
 * 퇴사 취소(복직) — 실수로 퇴사 처리한 경우를 되돌리기 위함.
 * 동일하게 관리자 비밀번호 재확인 필요.
 */
router.post("/users/:id/unresign", async (req, res) => {
  const u = (req as any).user;
  const parsed = z.object({ password: z.string().min(1).max(128) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });

  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "not found" });
  if (target.superAdmin && !u.superAdmin) return res.status(404).json({ error: "not found" });

  const me = await prisma.user.findUnique({ where: { id: u.id }, select: { passwordHash: true } });
  if (!me) return res.status(401).json({ error: "세션이 유효하지 않습니다" });
  const ok = await bcrypt.compare(parsed.data.password, me.passwordHash);
  if (!ok) {
    await writeLog(u.id, "USER_UNRESIGN_FAIL", req.params.id, "bad_password");
    return res.status(401).json({ error: "비밀번호가 올바르지 않습니다", code: "BAD_PASSWORD" });
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { resignedAt: null, active: true },
    select: HR_SELECT,
  });
  evictUserCache(target.id);
  await writeLog(u.id, "USER_UNRESIGN", target.id);
  res.json({ user: updated });
});

/* ===== 팀 ===== */
router.get("/teams", async (_req, res) => {
  const teams = await prisma.team.findMany({ orderBy: { createdAt: "asc" }, take: 500 });
  res.json({ teams });
});

// 팀/직급 이름은 UI 상 80자면 넉넉. zod schema (user.team/position) 와 동일한 상한으로 맞춤.
// 상한 없이는 수 MB name 으로 DB 를 부풀리거나 user.team 전수 업데이트가 극단적으로 느려질 수 있음.
function capName(raw: unknown, limit = 80): string {
  const s = String(raw ?? "").trim();
  return s.length > limit ? s.slice(0, limit) : s;
}

router.post("/teams", async (req, res) => {
  const name = capName(req.body?.name);
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
  const name = capName(req.body?.name);
  if (!name) return res.status(400).json({ error: "이름을 입력해주세요" });
  const u = (req as any).user;
  const prev = await prisma.team.findUnique({ where: { id: req.params.id } });
  if (!prev) return res.status(404).json({ error: "not found" });
  const team = await prisma.team.update({ where: { id: prev.id }, data: { name } });
  // 사용자 team 문자열도 동기화
  if (prev.name !== name) {
    // `team` 변수는 Team 객체라 문자열 필드에 바로 못 넣음. 새 이름 `name` 을 넣어야
    // 사용자의 team 문자열이 올바르게 동기화됨.
    await prisma.user.updateMany({ where: { team: prev.name }, data: { team: name } });
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
  const positions = await prisma.position.findMany({
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
    take: 500,
  });
  res.json({ positions });
});

router.post("/positions", async (req, res) => {
  const name = capName(req.body?.name);
  if (!name) return res.status(400).json({ error: "이름을 입력해주세요" });
  const u = (req as any).user;
  // rank 는 더이상 수동 입력받지 않음 — 드래그 정렬 UI 로 바뀌면서
  // 새 항목은 항상 맨 아래로 붙인다 (기존 max rank + 1).
  const last = await prisma.position.findFirst({ orderBy: { rank: "desc" }, select: { rank: true } });
  const rank = (last?.rank ?? -1) + 1;
  try {
    const position = await prisma.position.create({ data: { name, rank } });
    await writeLog(u.id, "POSITION_CREATE", position.id, name);
    res.json({ position });
  } catch (e: any) {
    if (e?.code === "P2002") return res.status(400).json({ error: "이미 존재하는 직급" });
    throw e;
  }
});

/**
 * 직급 순서 일괄 재정렬 — 드래그로 옮긴 후 클라가 전체 id 순서를 보낸다.
 * 누락된 id 가 있으면 400 (race 상태에서 레코드가 조용히 밀려나는 걸 방지).
 */
router.post("/positions/reorder", async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: any) => typeof x === "string") : [];
  if (!ids.length) return res.status(400).json({ error: "ids required" });
  const u = (req as any).user;

  const all = await prisma.position.findMany({ select: { id: true } });
  const existing = new Set(all.map((p) => p.id));
  if (ids.length !== existing.size || ids.some((id: string) => !existing.has(id))) {
    return res.status(400).json({ error: "ids 가 현재 직급 목록과 일치하지 않습니다" });
  }

  await prisma.$transaction(
    ids.map((id: string, i: number) =>
      prisma.position.update({ where: { id }, data: { rank: i } }),
    ),
  );
  await writeLog(u.id, "POSITION_REORDER", undefined, `${ids.length}건`);
  res.json({ ok: true });
});

router.patch("/positions/:id", async (req, res) => {
  const name = req.body?.name !== undefined ? capName(req.body.name) : undefined;
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
  const defaultDate = todayStr();
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
  const defaultDate = todayStr();
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
