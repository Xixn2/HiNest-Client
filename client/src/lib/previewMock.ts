/**
 * 미리보기(데모) 모드 — 비로그인 방문자가 \"실제 사용 화면\"을 바로 둘러볼 수 있도록
 * /api/* 호출을 가짜 데이터로 단락(short-circuit)시킨다.
 *
 * 동작:
 *  - GET /api/<known> → 미리 정의된 fixture 응답
 *  - 기타 GET → 404 (컴포넌트가 빈 화면으로 graceful fall-through)
 *  - POST/PATCH/DELETE → 미리보기에선 차단(409). 호출부가 alert 띄움.
 *  - SSE(/notification/stream 등) → 절대 연결되지 않게 401 즉시 반환.
 */

const TODAY = new Date();
const ymd = TODAY.toISOString().slice(0, 10);
function iso(daysOffset: number, hour = 9, min = 0): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

/* ===== 가짜 사용자/팀 ===== */
const DEMO_ME = {
  id: "demo-user",
  email: "demo@hinest.app",
  name: "김데모",
  role: "ADMIN",
  team: "프로덕트팀",
  position: "팀장",
  avatarColor: "#3D54C4",
  avatarUrl: null,
  superAdmin: false,
  isDeveloper: false,
  employeeNo: "AD0000001",
  presenceStatus: null,
  presenceMessage: null,
  presenceUpdatedAt: null,
  workStartTime: "09:00",
  workEndTime: "18:00",
};

/* ===== 한국 회사 톤의 풍부한 데모 명단 — 8개 팀 / 6개 직급 / 사원 30명+ =====
 * 구성:
 *  - 임원/부장/팀장/매니저 약간 + 사원~대리 다수 → 진짜 회사처럼 피라미드 형태.
 *  - presenceStatus 와 avatarColor 는 결정론적 분배로 매 새로고침마다 동일.
 */
const DEMO_TEAMS = ["프로덕트팀", "디자인팀", "개발팀", "마케팅팀", "운영팀", "영업팀", "인사팀", "재무팀"];
const AVATAR_PALETTE = ["#3D54C4", "#16A34A", "#7C3AED", "#DB2777", "#F59E0B", "#0EA5E9", "#EF4444", "#0891B2", "#84CC16", "#F97316"];
const PRESENCE_CYCLE: (string | null)[] = ["AVAILABLE", null, "MEETING", "MEAL", "OUT", null, "AWAY"];
function pick<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

// 임원/매니저 라인 (소수)
const LEADS = [
  { name: "이앨리스",  role: "MANAGER", team: "디자인팀",   position: "리드",   isDeveloper: false, presenceStatus: "AVAILABLE", presenceMessage: null },
  { name: "한이브",    role: "MANAGER", team: "운영팀",     position: "팀장",   isDeveloper: false, presenceStatus: "OUT",        presenceMessage: "외근" },
  { name: "박그레이스", role: "MANAGER", team: "개발팀",     position: "팀장",   isDeveloper: true,  presenceStatus: "MEETING",    presenceMessage: "스프린트 회의" },
  { name: "최마틴",    role: "MANAGER", team: "마케팅팀",   position: "팀장",   isDeveloper: false, presenceStatus: "AVAILABLE", presenceMessage: null },
  { name: "강레오",    role: "MANAGER", team: "영업팀",     position: "팀장",   isDeveloper: false, presenceStatus: "MEAL",       presenceMessage: null },
  { name: "윤소피아",  role: "MANAGER", team: "인사팀",     position: "팀장",   isDeveloper: false, presenceStatus: null,         presenceMessage: null },
  { name: "임도훈",    role: "ADMIN",   team: "재무팀",     position: "이사",   isDeveloper: false, presenceStatus: "MEETING",    presenceMessage: "이사회" },
];

// 대리·주임 (중간 라인)
const SENIORS = [
  { name: "오민준",   team: "개발팀",   position: "대리" },
  { name: "신유나",   team: "디자인팀", position: "대리" },
  { name: "권지호",   team: "프로덕트팀", position: "대리" },
  { name: "백수아",   team: "마케팅팀", position: "대리" },
  { name: "정하림",   team: "영업팀",   position: "대리" },
  { name: "조윤서",   team: "개발팀",   position: "주임" },
  { name: "남지훈",   team: "운영팀",   position: "주임" },
  { name: "유서연",   team: "재무팀",   position: "주임" },
];

// 사원 — 30명 (요청에 맞춰 조정)
const STAFF_NAMES = [
  "박밥", "최캐롤", "정데이브",
  "김지우", "이서연", "박민서", "최지유", "정하윤", "강지호", "조서윤",
  "윤예진", "임지안", "한서아", "오도윤", "신하준", "권시우", "백지민", "남수빈",
  "유주원", "장태윤", "전다은", "황현우", "송지아", "양은우", "구나윤", "노시은",
  "심예준", "차은서", "추민재",
];

function makeStaff(idx: number, name: string) {
  return {
    name,
    role: "MEMBER" as const,
    team: pick(DEMO_TEAMS, idx),
    position: idx % 7 === 0 ? "인턴" : "사원",
    isDeveloper: false,
    presenceStatus: pick(PRESENCE_CYCLE, idx),
    presenceMessage: null as string | null,
  };
}

function buildUsers() {
  const out: any[] = [DEMO_ME];
  let n = 0;
  // 리더진
  for (const l of LEADS) {
    n++;
    out.push({
      id: `u-lead-${n}`,
      email: `${(l.name || "user")}${n}@hinest.app`,
      avatarColor: pick(AVATAR_PALETTE, n),
      avatarUrl: null,
      presenceUpdatedAt: l.presenceStatus ? iso(0, 9 + (n % 8)) : null,
      ...l,
    });
  }
  // 시니어
  for (const s of SENIORS) {
    n++;
    out.push({
      id: `u-sr-${n}`,
      email: `${s.name}${n}@hinest.app`,
      role: "MEMBER" as const,
      isDeveloper: false,
      avatarColor: pick(AVATAR_PALETTE, n + 3),
      avatarUrl: null,
      presenceStatus: pick(PRESENCE_CYCLE, n),
      presenceMessage: null,
      presenceUpdatedAt: iso(0, 9 + (n % 9)),
      ...s,
    });
  }
  // 사원 (인턴 포함) — 30명+
  STAFF_NAMES.forEach((nm, i) => {
    n++;
    const base = makeStaff(i, nm);
    out.push({
      id: `u-mem-${n}`,
      email: `${nm}${n}@hinest.app`,
      avatarColor: pick(AVATAR_PALETTE, n + 5),
      avatarUrl: null,
      presenceUpdatedAt: base.presenceStatus ? iso(0, 9 + (n % 9)) : null,
      ...base,
    });
  });
  return out;
}

const DEMO_USERS = buildUsers();

/* ===== fixtures ===== */
function notices() {
  return {
    notices: [
      { id: "n1", title: "5월 정기 미팅 일정 안내",   content: "전사 미팅을 5월 15일 오후 2시에 진행합니다. 자세한 안건은 추후 공유 예정.", createdAt: iso(-1, 10), pinned: true,  author: { name: "이앨리스", isDeveloper: false } },
      { id: "n2", title: "여름 휴가 사용 가이드",     content: "여름 휴가는 6~8월 중 5일 이상 연속 사용을 권장드립니다.", createdAt: iso(-3, 14), pinned: false, author: { name: "한이브",   isDeveloper: false } },
      { id: "n3", title: "신규 입사자 환영합니다",     content: "이번 달 신규 입사자 4명이 합류했습니다. 따뜻하게 맞아주세요!", createdAt: iso(-5, 9),  pinned: false, author: { name: "김데모",   isDeveloper: false } },
      { id: "n4", title: "사무실 정수기 점검 예정",    content: "5월 12일 오전 9~10시 정수기 점검으로 일시 사용이 어렵습니다.", createdAt: iso(-6, 16), pinned: false, author: { name: "한이브",   isDeveloper: false } },
    ],
  };
}

function schedule() {
  return {
    events: [
      { id: "e1", title: "스프린트 킥오프",    startAt: iso(0, 10),  endAt: iso(0, 11),  scope: "TEAM",    color: "#3B5CF0" },
      { id: "e2", title: "디자인 리뷰",        startAt: iso(0, 14),  endAt: iso(0, 15),  scope: "TEAM",    color: "#7C3AED" },
      { id: "e3", title: "전사 OKR 공유",      startAt: iso(1, 11),  endAt: iso(1, 12),  scope: "COMPANY", color: "#16A34A" },
      { id: "e4", title: "1:1 (앨리스)",       startAt: iso(2, 15),  endAt: iso(2, 16),  scope: "PERSONAL",color: "#F59E0B" },
      { id: "e5", title: "프로덕트 데모",       startAt: iso(3, 13),  endAt: iso(3, 14),  scope: "COMPANY", color: "#DB2777" },
      { id: "e6", title: "회고 미팅",          startAt: iso(4, 16),  endAt: iso(4, 17),  scope: "TEAM",    color: "#3B5CF0" },
    ],
  };
}

function attendanceToday() {
  // 오늘 09:30 출근, 퇴근 X (\"근무 중\" 상태)
  const today = new Date(TODAY); today.setHours(9, 30, 0, 0);
  return { attendance: { checkIn: today.toISOString(), checkOut: null } };
}

function meetings() {
  return {
    meetings: [
      { id: "m1", title: "프로덕트 정기 회의 (5/8)",  visibility: "ALL",     projectId: null, authorId: "u2", createdAt: iso(-2, 14), updatedAt: iso(-1, 16), author: { id: "u2", name: "이앨리스", avatarColor: "#16A34A", isDeveloper: false, avatarUrl: null }, project: null },
      { id: "m2", title: "신규 기능 스펙 정리",       visibility: "PROJECT", projectId: "p1", authorId: "u3", createdAt: iso(-4, 10), updatedAt: iso(-3, 11), author: { id: "u3", name: "박밥",     avatarColor: "#7C3AED", isDeveloper: true,  avatarUrl: null }, project: { id: "p1", name: "HiNest v2", color: "#3B5CF0" } },
      { id: "m3", title: "5월 캠페인 브레인스토밍",   visibility: "ALL",     projectId: null, authorId: "u5", createdAt: iso(-6, 13), updatedAt: iso(-5, 14), author: { id: "u5", name: "정데이브", avatarColor: "#F59E0B", isDeveloper: false, avatarUrl: null }, project: null },
    ],
  };
}

function journalsList() {
  return {
    journals: [
      { id: "j1", date: ymd, title: "오늘 한 일", content: "기능 명세 검토, 디자인 시안 피드백, 1:1 미팅 진행.", createdAt: iso(0, 18), updatedAt: iso(0, 18), user: { name: "김데모" } },
      { id: "j2", date: iso(-1).slice(0, 10), title: "어제 진행 현황", content: "백엔드 API 스펙 합의, 프론트 라우팅 정리.", createdAt: iso(-1, 18), updatedAt: iso(-1, 18), user: { name: "김데모" } },
    ],
  };
}

function approvals() { return { approvals: [] }; }
function approvalCounts() { return { pending: 0, mine: 0 }; }
function notificationList() { return { notifications: [], unread: 0 }; }
function featureFlags() { return { flags: {} }; }
function teams() { return { teams: DEMO_TEAMS }; }
function navConfig() { return { items: [] }; }

/** 경로별 매처 — 정확히 일치하거나 prefix 매치. */
const HANDLERS: { test: (p: string) => boolean; data: () => any }[] = [
  { test: (p) => p === "/api/me",                      data: () => ({ user: DEMO_ME, impersonator: null }) },
  { test: (p) => p.startsWith("/api/users/teams"),     data: teams },
  { test: (p) => p === "/api/users" || p.startsWith("/api/users?"), data: () => {
      const enriched = DEMO_USERS.map((u, i) => ({
        ...u,
        active: true,
        workStatus: i === 0 ? "IN" : i % 3 === 0 ? "NONE" : "IN",
        checkIn: i === 0 ? attendanceToday().attendance.checkIn : null,
        checkOut: null,
        leaveType: null,
      }));
      return { users: enriched };
    },
  },
  { test: (p) => p.startsWith("/api/users/presence"),  data: () => ({ users: DEMO_USERS.map((u) => ({ id: u.id, presenceStatus: u.presenceStatus, presenceMessage: u.presenceMessage, workStatus: "IN" })) }) },
  { test: (p) => p.startsWith("/api/users/"),          data: () => ({ user: DEMO_USERS[1] }) }, // 다른 사람 프로필 진입 시
  { test: (p) => p.startsWith("/api/notice"),          data: notices },
  { test: (p) => p.startsWith("/api/schedule"),        data: schedule },
  { test: (p) => p === "/api/attendance/today",        data: attendanceToday },
  { test: (p) => p.startsWith("/api/attendance"),      data: () => ({ attendances: [], leaves: [] }) },
  { test: (p) => p.startsWith("/api/meeting"),         data: meetings },
  { test: (p) => p.startsWith("/api/journal"),         data: journalsList },
  { test: (p) => p === "/api/approval/counts",         data: approvalCounts },
  { test: (p) => p.startsWith("/api/approval"),        data: approvals },
  { test: (p) => p.startsWith("/api/notification"),    data: notificationList },
  { test: (p) => p.startsWith("/api/feature-flags"),   data: featureFlags },
  { test: (p) => p.startsWith("/api/nav"),             data: navConfig },
  { test: (p) => p.startsWith("/api/document"),        data: () => ({ documents: [], folders: [] }) },
  { test: (p) => p.startsWith("/api/expense"),         data: () => ({ expenses: [] }) },
  { test: (p) => p.startsWith("/api/chat"),            data: () => ({ rooms: [], messages: [] }) },
  { test: (p) => p.startsWith("/api/project"),         data: () => ({ projects: [] }) },
  { test: (p) => p.startsWith("/api/version"),         data: () => ({ version: "preview" }) },
  { test: (p) => p.startsWith("/api/pins"),            data: () => ({ pins: [] }) },
  { test: (p) => p.startsWith("/api/snippet"),         data: () => ({ snippets: [] }) },

  // Attendance / Leave
  { test: (p) => p.startsWith("/api/attendance/leave"), data: () => ({ leaves: [] }) },
  { test: (p) => p.startsWith("/api/attendance"),      data: () => ({ attendances: [], leaves: [] }) },

  // Document
  { test: (p) => p.startsWith("/api/document/folders"),  data: () => ({ folders: [] }) },
  { test: (p) => p.startsWith("/api/document/projects"), data: () => ({ projects: [] }) },
  { test: (p) => p.startsWith("/api/document"),          data: () => ({ documents: [], folders: [] }) },

  // Service accounts
  { test: (p) => p.startsWith("/api/service-accounts/projects"), data: () => ({ projects: [] }) },
  { test: (p) => p.startsWith("/api/service-accounts"), data: () => ({ accounts: [] }) },

  // Approval extras
  { test: (p) => p.startsWith("/api/approval-extras/lines"),     data: () => ({ lines: [] }) },
  { test: (p) => p.startsWith("/api/approval-extras/templates"), data: () => ({ templates: [] }) },
  { test: (p) => p.startsWith("/api/approval-extras"),           data: () => ({}) },

  // Profile
  { test: (p) => p.startsWith("/api/profile"),         data: () => ({ user: DEMO_ME }) },

  // Admin — 클라이언트가 기대하는 키 이름에 정확히 맞춤
  { test: (p) => p.startsWith("/api/admin/invites"),        data: () => ({ keys: [] }) }, // ⚠ keys 가 정답
  { test: (p) => p.startsWith("/api/admin/teams"),          data: () => ({ teams: DEMO_TEAMS.map((t, i) => ({ id: `t${i}`, name: t, createdAt: iso(-30) })) }) },
  { test: (p) => p.startsWith("/api/admin/positions"),      data: () => ({ positions: ["인턴", "사원", "주임", "대리", "리드", "팀장", "이사"].map((n, i) => ({ id: `p${i}`, name: n, rank: i, createdAt: iso(-30) })) }) },
  { test: (p) => p.startsWith("/api/admin/users"),          data: () => ({ users: DEMO_USERS.map((u) => ({ ...u, active: true, createdAt: iso(-90) })) }) },
  { test: (p) => p.startsWith("/api/admin/nav-visibility"), data: () => ({ items: [] }) },
  { test: (p) => p.startsWith("/api/admin/logs"),           data: () => ({ logs: [] }) },
  { test: (p) => p.startsWith("/api/admin"),                data: () => ({}) },

  // 알림 설정 / 채팅
  { test: (p) => p.startsWith("/api/notification/prefs"), data: () => ({ prefs: {}, dndStart: null, dndEnd: null }) },

  // 검색
  { test: (p) => p.startsWith("/api/search"),          data: () => ({ users: [], notices: [], events: [], documents: [], messages: [], meetings: [], approvals: [] }) },
];

/** 미리보기 모드에서 api.ts 가 호출하는 진입점. */
export function previewMockFetch(path: string, init: RequestInit & { json?: any }): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();

  // 쓰기 작업은 차단 — 데모 데이터는 변경 불가.
  if (method !== "GET" && method !== "HEAD") {
    return Promise.resolve(jsonResponse(403, { error: "미리보기 모드에선 변경할 수 없어요. 가입 후 사용해 보세요." }));
  }

  const handler = HANDLERS.find((h) => h.test(path));
  if (handler) {
    return Promise.resolve(jsonResponse(200, handler.data()));
  }
  // 매처 없는 경로는 빈 객체로 graceful — 컴포넌트가 빈 상태로 렌더.
  return Promise.resolve(jsonResponse(200, {}));
}

function jsonResponse(status: number, body: any): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** 미리보기 활성 여부 — api.ts / 여러 hook 에서 동일하게 검사. */
export function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  if ((window as any).__HINEST_PREVIEW__ === true) return true;
  try {
    if (sessionStorage.getItem(PREVIEW_KEY) === "1") {
      (window as any).__HINEST_PREVIEW__ = true; // 다음 호출 빠르게.
      return true;
    }
  } catch {}
  return false;
}

const PREVIEW_KEY = "hinest:preview";

export function enablePreview() {
  if (typeof window === "undefined") return;
  (window as any).__HINEST_PREVIEW__ = true;
  try { sessionStorage.setItem(PREVIEW_KEY, "1"); } catch {}
}

export function disablePreview() {
  if (typeof window === "undefined") return;
  (window as any).__HINEST_PREVIEW__ = false;
  try { sessionStorage.removeItem(PREVIEW_KEY); } catch {}
}
