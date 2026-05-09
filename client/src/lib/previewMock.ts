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

const DEMO_USERS = [
  DEMO_ME,
  { id: "u2", email: "alice@hinest.app", name: "이앨리스", role: "MANAGER", team: "디자인팀", position: "리드", avatarColor: "#16A34A",   avatarUrl: null, isDeveloper: false, presenceStatus: "AVAILABLE",  presenceMessage: null, presenceUpdatedAt: iso(0, 9) },
  { id: "u3", email: "bob@hinest.app",   name: "박밥",     role: "MEMBER",  team: "개발팀",   position: "사원", avatarColor: "#7C3AED",   avatarUrl: null, isDeveloper: true,  presenceStatus: "MEETING",    presenceMessage: "스프린트 회의", presenceUpdatedAt: iso(0, 10) },
  { id: "u4", email: "carol@hinest.app", name: "최캐롤",   role: "MEMBER",  team: "개발팀",   position: "주임", avatarColor: "#DB2777",   avatarUrl: null, isDeveloper: false, presenceStatus: "MEAL",       presenceMessage: null, presenceUpdatedAt: iso(0, 12) },
  { id: "u5", email: "dave@hinest.app",  name: "정데이브", role: "MEMBER",  team: "마케팅팀", position: "사원", avatarColor: "#F59E0B",   avatarUrl: null, isDeveloper: false, presenceStatus: null,         presenceMessage: null, presenceUpdatedAt: null },
  { id: "u6", email: "eve@hinest.app",   name: "한이브",   role: "MANAGER", team: "운영팀",   position: "팀장", avatarColor: "#0EA5E9",   avatarUrl: null, isDeveloper: false, presenceStatus: "OUT",        presenceMessage: "외근", presenceUpdatedAt: iso(0, 14) },
];

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
function notificationList() { return { items: [], unread: 0 }; }
function featureFlags() { return { flags: {} }; }
function teams() { return { teams: ["프로덕트팀", "디자인팀", "개발팀", "마케팅팀", "운영팀"] }; }
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
