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

const DEMO_MEETINGS = [
  { id: "m1", title: "프로덕트 정기 회의 (5/8)",  visibility: "ALL",     projectId: null, authorId: "u-lead-1", createdAt: iso(-2, 14), updatedAt: iso(-1, 16), author: { id: "u-lead-1", name: "이앨리스", avatarColor: "#16A34A", isDeveloper: false, avatarUrl: null }, project: null },
  { id: "m2", title: "신규 기능 스펙 정리",       visibility: "PROJECT", projectId: "p1", authorId: "u-lead-3", createdAt: iso(-4, 10), updatedAt: iso(-3, 11), author: { id: "u-lead-3", name: "박그레이스", avatarColor: "#7C3AED", isDeveloper: true,  avatarUrl: null }, project: { id: "p1", name: "HiNest v2", color: "#3B5CF0" } },
  { id: "m3", title: "5월 캠페인 브레인스토밍",   visibility: "ALL",     projectId: null, authorId: "u-lead-4", createdAt: iso(-6, 13), updatedAt: iso(-5, 14), author: { id: "u-lead-4", name: "최마틴", avatarColor: "#F59E0B", isDeveloper: false, avatarUrl: null }, project: null },
];

function meetings() {
  return { meetings: DEMO_MEETINGS };
}

/* ===== TipTap JSON 헬퍼 — 회의록 본문 작성용 ===== */
type TipTapNode = any;
const t  = (text: string, ...marks: string[]): TipTapNode => ({ type: "text", text, ...(marks.length ? { marks: marks.map((m) => ({ type: m })) } : {}) });
const tH = (text: string, color: string): TipTapNode => ({ type: "text", text, marks: [{ type: "highlight", attrs: { color } }] });
const tL = (text: string, href: string): TipTapNode => ({ type: "text", text, marks: [{ type: "link", attrs: { href, target: "_blank", rel: "noopener" } }] });
const p   = (...kids: TipTapNode[]): TipTapNode => ({ type: "paragraph", content: kids.length ? kids : [{ type: "text", text: "" }] });
const h   = (level: 1 | 2 | 3, ...kids: TipTapNode[]): TipTapNode => ({ type: "heading", attrs: { level }, content: kids });
const li  = (...kids: TipTapNode[]): TipTapNode => ({ type: "listItem", content: kids });
const ul  = (...items: TipTapNode[]): TipTapNode => ({ type: "bulletList", content: items });
const ol  = (...items: TipTapNode[]): TipTapNode => ({ type: "orderedList", content: items });
const tk  = (checked: boolean, ...kids: TipTapNode[]): TipTapNode => ({ type: "taskItem", attrs: { checked }, content: kids });
const tkl = (...items: TipTapNode[]): TipTapNode => ({ type: "taskList", content: items });
const cb  = (language: string, code: string): TipTapNode => ({ type: "codeBlock", attrs: { language }, content: [{ type: "text", text: code }] });
const bq  = (...kids: TipTapNode[]): TipTapNode => ({ type: "blockquote", content: kids });
const hr  = (): TipTapNode => ({ type: "horizontalRule" });
const mention = (id: string, label: string): TipTapNode => ({ type: "mention", attrs: { id, label } });

const MEETING_BODIES: Record<string, TipTapNode> = {
  m1: {
    type: "doc",
    content: [
      h(1, t("프로덕트 정기 회의 — 5월 8일")),
      p(t("일시 ", "bold"), t("· 5월 8일 (목) 14:00 ~ 15:30  "), t("· 회의실 B", "italic")),
      p(t("참석 ", "bold"), mention("u-lead-1", "이앨리스"), t(" "), mention("u-lead-3", "박그레이스"), t(" "), mention("u-lead-4", "최마틴"), t(" "), mention(DEMO_ME.id, "김데모")),
      hr(),
      h(2, t("📋 안건")),
      ol(
        li(p(t("지난 주 마일스톤 회고"))),
        li(p(t("v2 베타 피드백 정리"))),
        li(p(t("다음 스프린트 우선순위 조정"))),
        li(p(t("Q3 OKR 초안 검토"))),
      ),
      h(2, t("✅ 결정 사항")),
      ul(
        li(p(t("베타 사용자 ", "bold"), tH("30% 추가 모집", "#FEF3C7"), t(" — 이번 주 안에 시작"))),
        li(p(t("v2 정식 런칭은 ", "bold"), t("6월 2주차", "italic"), t(" 로 확정"))),
        li(p(t("디자인 시스템 마이그레이션을 v2.1 로 미루기로 합의"))),
      ),
      bq(p(t("\"속도보다는 첫 인상이 중요하다\" — 베타 피드백 키워드 정리에서 가장 많이 나온 의견."))),
      h(2, t("🎯 액션 아이템")),
      tkl(
        tk(true,  p(t("베타 만족도 설문 v2 발송 (")), p(mention("u-lead-1", "이앨리스"))),
        tk(false, p(t("로딩 화면 스켈레톤 톤 통일 — "), mention("u-lead-3", "박그레이스"))),
        tk(false, p(t("Q3 OKR 초안 작성 — "), mention(DEMO_ME.id, "김데모"), t(" / 5/12 까지"))),
        tk(false, p(t("마케팅 협업 미팅 잡기 — "), mention("u-lead-4", "최마틴"))),
      ),
      h(2, t("📊 현재 메트릭")),
      ul(
        li(p(t("주간 활성 사용자 ", "bold"), t("1,240명", "code"), t(" (전주 대비 +18%)"))),
        li(p(t("평균 응답 시간 ", "bold"), t("184ms", "code"), t(" / 목표 200ms"))),
        li(p(t("신규 가입 전환율 ", "bold"), tH("23%", "#D1FAE5"), t(" — 사상 최고"))),
      ),
      h(2, t("📎 참고 링크")),
      p(tL("v2 베타 피드백 보드", "https://example.com/feedback"), t(" / "), tL("Q3 OKR 템플릿", "https://example.com/okr")),
      hr(),
      p(t("다음 회의: ", "bold"), t("5월 15일 (목) 14:00 — 같은 자리.")),
    ],
  },
  m2: {
    type: "doc",
    content: [
      h(1, t("신규 기능 스펙 — 결재 자동화 v1")),
      bq(p(t("자주 쓰는 결재(출장/지출/구매)를 한 번에 만드는 ", "bold"), t("템플릿 + 자동 결재선 추천"), t(" 기능. 5월 말 베타 목표."))),
      h(2, t("📐 요구사항")),
      ul(
        li(p(t("결재 템플릿 5종 기본 제공 (출장/지출/구매/외근/연차)"))),
        li(p(t("이전 신청 패턴 기반 ", "italic"), t("결재선 자동 추천", "bold"))),
        li(p(t("Slack/사내톡 멘션으로 진행 상황 알림"))),
        li(p(t("모바일에서도 동일하게 작동"))),
      ),
      h(2, t("🔌 API 스펙 (초안)")),
      cb("ts", `// 결재 템플릿 목록
GET /api/approval/templates
→ { templates: [{ id, name, type, fields, suggestedReviewers }] }

// 자동 결재선 추천
POST /api/approval/suggest-line
body: { type: "TRIP", amount?: number, projectId?: string }
→ { reviewers: [{ id, name, reason }] }

// 템플릿으로 신청
POST /api/approval
body: { templateId, data }`),
      h(2, t("⏱ 마일스톤")),
      tkl(
        tk(true,  p(t("DB 스키마 ApprovalTemplate / SuggestionRule 추가"))),
        tk(true,  p(t("템플릿 5종 시드 데이터 작성"))),
        tk(false, p(t("자동 결재선 추천 알고리즘 구현 — "), mention("u-lead-3", "박그레이스"))),
        tk(false, p(t("프론트 결재 신청 화면에 템플릿 선택 UI 추가"))),
        tk(false, p(t("QA + 베타 그룹 테스트 (5월 4주차)"))),
        tk(false, p(t("정식 배포 (6월 1주차)"))),
      ),
      h(2, t("⚠️ 리스크 / 미정 사항")),
      ul(
        li(p(t("자동 추천 정확도 ", "bold"), tH("70% 미만이면 베타 연기", "#FEE2E2"), t(" 결정"))),
        li(p(t("기존 결재선 즐겨찾기와 UX 충돌 가능 — 우선순위 합의 필요"))),
      ),
      hr(),
      p(t("다음 점검: 5월 15일 정기 회의에서 진행률 공유.")),
    ],
  },
  m3: {
    type: "doc",
    content: [
      h(1, t("5월 캠페인 브레인스토밍")),
      p(t("여름 시즌 SNS · 바이럴 캠페인 아이디어 발산. 후속 액션은 ", "italic"), t("5/15", "bold"), t(" 까지 정리.")),
      h(2, t("🌟 핵심 키워드")),
      p(tH("간결함", "#FEF3C7"), t(" · "), tH("일상의 작은 변화", "#D1FAE5"), t(" · "), tH("동료의 한 마디", "#DBEAFE")),
      h(2, t("💡 떠오른 아이디어")),
      ul(
        li(p(t("\"우리 팀의 5분 회의\"", "bold"), t(" — 임직원 인터뷰 시리즈"))),
        li(p(t("\"오늘 하루 1줄\"", "bold"), t(" — 사용자가 매일 짧은 회고를 남기는 챌린지"))),
        li(p(t("템플릿 갤러리", "bold"), t(" — 회의록/일지 템플릿 무료 공유 마이크로사이트"))),
        li(p(t("디자이너 토크", "bold"), t(" — 스펙 작성 → 디자인 → 출시까지의 비하인드 콘텐츠"))),
      ),
      h(2, t("📅 채널별 액션")),
      tkl(
        tk(false, p(t("Instagram Reels — 주 2회, 30초 이내"))),
        tk(false, p(t("YouTube Shorts — 인터뷰 시리즈 (월 4편)"))),
        tk(false, p(t("LinkedIn — 디자이너 토크 장문 포스팅"))),
        tk(false, p(t("X(Twitter) — 템플릿 갤러리 트위터 카드"))),
        tk(false, p(t("팀 블로그 — 키워드별 매주 1편"))),
      ),
      h(2, t("📎 참고")),
      p(tL("벤치마킹 무드보드", "https://example.com/moodboard"), t(" · "), tL("브랜드 컬러 가이드", "https://example.com/brand")),
      bq(p(t("\"광고처럼 만들지 말자.\" — "), mention("u-lead-4", "최마틴"))),
      hr(),
      p(t("다음 미팅: 5월 13일 (월) 11:00 — 액션별 owner 확정.")),
    ],
  },
};

/* 회의록 수정 이력 — 미리보기에선 회의록 별 2개씩 가짜 이력. */
function meetingRevisions(id: string) {
  const me = { id: DEMO_ME.id, name: DEMO_ME.name };
  const alice = { id: "u-lead-1", name: "이앨리스" };
  const grace = { id: "u-lead-3", name: "박그레이스" };
  const author = id === "m1" ? alice : id === "m2" ? grace : { id: "u-lead-4", name: "최마틴" };
  const body = MEETING_BODIES[id] ?? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "" }] }] };
  return [
    { id: `${id}-rev2`, title: (DEMO_MEETINGS.find((m) => m.id === id)?.title ?? "회의록") + "",   content: body, createdAt: iso(-1, 16, 30), author: me },
    { id: `${id}-rev1`, title: "회의록 (초안)", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "초안 — 안건만 정리" }] }] }, createdAt: iso(-2, 14), author },
  ];
}

function meetingDetail(id: string) {
  const base = DEMO_MEETINGS.find((m) => m.id === id) ?? DEMO_MEETINGS[0];
  const body = MEETING_BODIES[base.id] ?? { type: "doc", content: [p(t("(빈 회의록)"))] };
  return {
    meeting: {
      ...base,
      content: body,
      viewers: [],
      revisions: [],
      revisedFrom: null,
    },
  };
}

function journalsList() {
  const me = { name: DEMO_ME.name };
  const J = (n: number, title: string, content: string) => ({
    id: `j${-n}`,
    date: iso(n).slice(0, 10),
    title,
    content,
    createdAt: iso(n, 18),
    updatedAt: iso(n, 18),
    user: me,
  });
  return {
    journals: [
      J(0, "오늘",
`■ 한 일
- 결재 자동화 v1 스펙 PR 리뷰 (#231) — 댓글 6개, 1차 승인
- 베타 사용자 피드백 정리 (총 18건 → 우선순위 4단계로 분류)
- 박그레이스님과 1:1 — 다음 스프린트 인력 배분 합의
- Q3 OKR 초안 1/3 작성

■ 막힌 것
- 자동 결재선 추천 정확도 측정 데이터셋이 부족함. 운영팀 협조 필요.

■ 내일
- Q3 OKR 초안 마무리 (오전)
- 마케팅팀 캠페인 협업 미팅 (14시)
- 결재 자동화 베타 그룹 선정`),
      J(-1, "수요일",
`■ 한 일
- v2 베타 모니터링 — 평균 응답 시간 184ms (목표 200ms 이내, 안정)
- 회의록 검색 인덱싱 도입 PR 머지 (#229)
- 신규 입사자 온보딩 문서 v3 검토

■ 메모
- 베타 사용자 만족도 설문 v2 발송 → 24시간 내 응답률 41%`),
      J(-2, "화요일",
`■ 한 일
- 결재 자동화 마일스톤 정리 — 5월 4주 베타, 6월 1주 정식
- 사내톡 메시지 필터링 정책 회의
- 인사팀과 휴가 자동 연동 케이스 합의

■ 내일
- 결재 자동화 v1 스펙 마무리`),
      J(-3, "월요일",
`■ 한 일
- 주간 회고 — 지난 주 OKR 진척률 72%
- 디자인 시스템 v2.1 보류 결정 사유 정리

■ 메모
- 다음 스프린트는 결재 자동화에 집중`),
      J(-7, "지난 주 회고",
`■ 잘 된 것
- v2 베타 첫 주 안정적 운영 — 사고 0건
- 신규 가입 전환율 23% (사상 최고)

■ 부족했던 것
- 모바일 채팅 알림 누락 이슈 — 발견 후 회복까지 5시간

■ 다음 주
- 결재 자동화 스펙 확정
- 모바일 알림 SLA 모니터링 추가`),
    ],
  };
}

/* ===== 전자결재 데모 ===== */
function demoApprovalsAll() {
  const meReq = { id: DEMO_ME.id, name: DEMO_ME.name, avatarColor: DEMO_ME.avatarColor, avatarUrl: null, position: DEMO_ME.position, team: DEMO_ME.team };
  const reviewers = [
    { id: "u-lead-1", name: "이앨리스",   avatarColor: "#16A34A", avatarUrl: null, position: "리드" },
    { id: "u-lead-7", name: "임도훈",     avatarColor: "#3D54C4", avatarUrl: null, position: "이사" },
    { id: "u-lead-3", name: "박그레이스", avatarColor: "#7C3AED", avatarUrl: null, position: "팀장" },
  ];
  const step = (n: number, who: typeof reviewers[number], status: "PENDING"|"APPROVED"|"REJECTED"|"SKIPPED", actedAt?: string|null, comment?: string|null) =>
    ({ id: `s${n}-${Math.random().toString(36).slice(2, 6)}`, order: n, status, comment: comment ?? null, actedAt: actedAt ?? null, reviewer: who });
  return [
    { id: "ap1", type: "TRIP" as const, title: "부산 출장 — 고객 미팅", content: "5/15~16, 부산 KT 본사 미팅 동행. 항공+호텔 1박.",
      status: "PENDING" as const, startDate: iso(7).slice(0,10), endDate: iso(8).slice(0,10), amount: 320000, createdAt: iso(-1, 11),
      requester: meReq, steps: [step(1, reviewers[0], "APPROVED", iso(-1, 14), "확인했습니다."), step(2, reviewers[1], "PENDING")], currentReviewerId: reviewers[1].id },
    { id: "ap2", type: "PURCHASE" as const, title: "키보드/마우스 구매", content: "재택용 무선 키보드 + 마우스 (Logitech).",
      status: "APPROVED" as const, amount: 86000, createdAt: iso(-3, 9),
      requester: meReq, steps: [step(1, reviewers[0], "APPROVED", iso(-3, 10), null), step(2, reviewers[1], "APPROVED", iso(-3, 13), "OK")], currentReviewerId: undefined },
    { id: "ap3", type: "EXPENSE" as const, title: "외부 컨퍼런스 참가", content: "5/30 NextJS Conf 온라인 티켓 + 점심.",
      status: "REJECTED" as const, amount: 120000, createdAt: iso(-5, 14),
      requester: meReq, steps: [step(1, reviewers[0], "APPROVED", iso(-5, 15), null), step(2, reviewers[1], "REJECTED", iso(-4, 10), "올해 교육 예산 소진 — 다음 분기에 재신청 부탁드립니다.")], currentReviewerId: undefined },
    { id: "ap4", type: "OFFSITE" as const, title: "광화문 고객사 외근", content: "5/12 오후 — 미팅 후 곧장 퇴근.",
      status: "PENDING" as const, startDate: iso(2).slice(0,10), endDate: iso(2).slice(0,10), createdAt: iso(0, 9),
      requester: { id: "u-mem-12", name: "박민서", avatarColor: "#F59E0B", avatarUrl: null, position: "사원", team: "마케팅팀" },
      steps: [step(1, { id: DEMO_ME.id, name: DEMO_ME.name, avatarColor: DEMO_ME.avatarColor, avatarUrl: null, position: DEMO_ME.position }, "PENDING")], currentReviewerId: DEMO_ME.id },
    { id: "ap5", type: "GENERAL" as const, title: "재택 근무 신청", content: "이사로 인해 5/20 하루 재택.",
      status: "PENDING" as const, startDate: iso(10).slice(0,10), endDate: iso(10).slice(0,10), createdAt: iso(0, 13),
      requester: { id: "u-mem-3", name: "최지유", avatarColor: "#7C3AED", avatarUrl: null, position: "사원", team: "디자인팀" },
      steps: [step(1, { id: DEMO_ME.id, name: DEMO_ME.name, avatarColor: DEMO_ME.avatarColor, avatarUrl: null, position: DEMO_ME.position }, "PENDING")], currentReviewerId: DEMO_ME.id },
  ];
}

function approvals(p?: string) {
  const m = (p ?? "").match(/scope=([^&]+)/);
  const scope = m?.[1] ?? "mine";
  const list = demoApprovalsAll();
  if (scope === "pending") return { approvals: list.filter((a) => a.status === "PENDING" && a.currentReviewerId === DEMO_ME.id) };
  if (scope === "mine")    return { approvals: list.filter((a) => a.requester.id === DEMO_ME.id) };
  return { approvals: list };
}

/* ===== 데모 프로젝트 ===== */
const DEMO_PROJECTS = [
  { id: "p1", name: "HiNest v2",      description: "차세대 사내 협업 플랫폼 리뉴얼",  color: "#3B5CF0", status: "ACTIVE" as const,   createdById: DEMO_ME.id, createdAt: iso(-90), updatedAt: iso(-1) },
  { id: "p4", name: "마케팅 Q3 캠페인", description: "여름 시즌 SNS·바이럴 캠페인",    color: "#DB2777", status: "ACTIVE" as const,   createdById: "u-lead-4",  createdAt: iso(-30), updatedAt: iso(-1) },
  { id: "p5", name: "사내 자료 정리",   description: "레거시 문서 마이그레이션 스프린트", color: "#7C3AED", status: "ARCHIVED" as const, createdById: "u-lead-2",  createdAt: iso(-180), updatedAt: iso(-60) },
];

function projectList() { return { projects: DEMO_PROJECTS }; }

/* ===== 문서함 데모 ===== */
function demoFolders() {
  return [
    { id: "f1", name: "회사 운영", parentId: null, createdAt: iso(-180), scope: "ALL" as const, scopeTeam: null, scopeUserIds: null },
    { id: "f2", name: "개발 자료", parentId: null, createdAt: iso(-120), scope: "TEAM" as const, scopeTeam: "개발팀", scopeUserIds: null },
    { id: "f3", name: "디자인 리소스", parentId: null, createdAt: iso(-90),  scope: "TEAM" as const, scopeTeam: "디자인팀", scopeUserIds: null },
    { id: "f4", name: "내 메모", parentId: null, createdAt: iso(-30),  scope: "PRIVATE" as const, scopeTeam: null, scopeUserIds: null },
  ];
}
function demoDocs() {
  const meAuthor = { name: DEMO_ME.name, avatarColor: DEMO_ME.avatarColor, avatarUrl: null };
  return [
    { id: "d1", title: "복리후생 가이드 v3",     description: "휴가/식대/교육비 정책",        folderId: "f1", fileUrl: null, fileName: null, fileType: null, fileSize: null, tags: "HR,복리후생",       scope: "ALL"     as const, scopeTeam: null,        scopeUserIds: null, createdAt: iso(-60), updatedAt: iso(-3),  author: meAuthor, folder: { name: "회사 운영" } },
    { id: "d2", title: "신규 입사자 온보딩",      description: "1~2주 체크리스트",             folderId: "f1", fileUrl: null, fileName: null, fileType: null, fileSize: null, tags: "온보딩,HR",         scope: "ALL"     as const, scopeTeam: null,        scopeUserIds: null, createdAt: iso(-40), updatedAt: iso(-10), author: meAuthor, folder: { name: "회사 운영" } },
    { id: "d3", title: "API 컨벤션",              description: "REST 네이밍 / 에러 코드",      folderId: "f2", fileUrl: null, fileName: null, fileType: null, fileSize: null, tags: "개발,API",           scope: "TEAM"    as const, scopeTeam: "개발팀",    scopeUserIds: null, createdAt: iso(-90), updatedAt: iso(-5),  author: { name: "박그레이스", avatarColor: "#7C3AED", avatarUrl: null }, folder: { name: "개발 자료" } },
    { id: "d4", title: "Figma 컬러 토큰",         description: "디자인 시스템 v2",            folderId: "f3", fileUrl: null, fileName: null, fileType: null, fileSize: null, tags: "디자인,토큰",       scope: "TEAM"    as const, scopeTeam: "디자인팀",  scopeUserIds: null, createdAt: iso(-50), updatedAt: iso(-1),  author: { name: "이앨리스",   avatarColor: "#16A34A", avatarUrl: null }, folder: { name: "디자인 리소스" } },
    { id: "d5", title: "주간 업무 보고 템플릿",   description: null,                            folderId: null, fileUrl: null, fileName: null, fileType: null, fileSize: null, tags: "템플릿",             scope: "ALL"     as const, scopeTeam: null,        scopeUserIds: null, createdAt: iso(-20), updatedAt: iso(-7),  author: meAuthor, folder: null },
    { id: "d6", title: "내 회고 노트",             description: "주간 회고 모음",                folderId: "f4", fileUrl: null, fileName: null, fileType: null, fileSize: null, tags: "회고",               scope: "PRIVATE" as const, scopeTeam: null,        scopeUserIds: null, createdAt: iso(-15), updatedAt: iso(0),   author: meAuthor, folder: { name: "내 메모" } },
  ];
}

/* ===== 사내톡 데모 =====
 *  - DM (이앨리스), 팀방(개발팀), 전사 공지방 3개
 *  - 메시지: 텍스트 / 이모지 / 코드 / 이미지 / 반응 */
function chatRooms() {
  const me = { id: DEMO_ME.id, name: DEMO_ME.name, avatarColor: DEMO_ME.avatarColor, avatarUrl: null };
  const alice = { id: "u-lead-1", name: "이앨리스",   avatarColor: "#16A34A", avatarUrl: null };
  const grace = { id: "u-lead-3", name: "박그레이스", avatarColor: "#7C3AED", avatarUrl: null };
  return [
    { id: "r1", name: "이앨리스", type: "DIRECT" as const,
      members: [{ user: me }, { user: alice }],
      messages: [{ content: "👍 확인했습니다 — 내일 보고 드릴게요!", createdAt: iso(0, 14, 32), kind: "TEXT" as const, senderId: alice.id }],
    },
    { id: "r2", name: "개발팀", type: "TEAM" as const,
      members: [{ user: me }, { user: grace }, { user: { id: "u-mem-1", name: "박밥", avatarColor: "#7C3AED", avatarUrl: null } }],
      messages: [{ content: "(이미지)", createdAt: iso(0, 11, 5), kind: "IMAGE" as const, senderId: grace.id }],
    },
    { id: "r3", name: "전사 공지", type: "GROUP" as const,
      members: [{ user: me }, { user: alice }, { user: grace }],
      messages: [{ content: "5/15 정수기 점검 안내드립니다.", createdAt: iso(-1, 9, 30), kind: "TEXT" as const, senderId: "u-lead-2" }],
    },
  ];
}

function chatMessages(roomId: string) {
  const me     = { id: DEMO_ME.id, name: DEMO_ME.name, avatarColor: DEMO_ME.avatarColor, avatarUrl: null };
  const alice  = { id: "u-lead-1", name: "이앨리스",   avatarColor: "#16A34A", avatarUrl: null };
  const grace  = { id: "u-lead-3", name: "박그레이스", avatarColor: "#7C3AED", avatarUrl: null };
  const eve    = { id: "u-lead-2", name: "한이브",     avatarColor: "#0EA5E9", avatarUrl: null };
  const bob    = { id: "u-mem-1", name: "박밥",         avatarColor: "#7C3AED", avatarUrl: null };
  const m = (id: string, sender: any, content: string, opts: any = {}) => ({
    id, content, kind: "TEXT" as const, createdAt: opts.at ?? iso(0, 11),
    sender, reactions: opts.reactions ?? [], ...opts,
  });

  if (roomId === "r1") {
    // DM with 이앨리스 — 텍스트 + 코드 + 이미지 + 반응
    return [
      m("m1-1",  alice, "오늘 베타 피드백 정리한 거 보셨나요? 👀",          { at: iso(0, 11, 2) }),
      m("m1-2",  me,    "네 방금 확인했어요! 우선순위 4단계 정리 좋네요 💯", { at: iso(0, 11, 4),
        reactions: [{ userId: alice.id, emoji: "❤️", user: { name: "이앨리스" } }] }),
      m("m1-3",  alice, "혹시 이 화면 톤 너무 회색 같지 않아요?",            { at: iso(0, 11, 12) }),
      m("m1-4",  alice, "참고용 스크린샷이에요",                              { at: iso(0, 11, 12, 30) }),
      m("m1-5",  alice, "scrn-2026-05-08.png", {
        at: iso(0, 11, 13), kind: "IMAGE",
        fileUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=720&q=70",
        fileName: "scrn-2026-05-08.png", fileType: "image/png", fileSize: 184_300,
      }),
      m("m1-6",  me,    "확실히 좀 더 채도 올려도 될 것 같아요. 디자인 시스템 v2.1 에 반영하시죠.", { at: iso(0, 11, 18) }),
      m("m1-7",  alice, "엇 좋아요. 혹시 토큰 적용 코드 어디서 바꾸는지 알려주실 수 있나요?", { at: iso(0, 11, 25) }),
      m("m1-8",  me, "이 부분이에요 ↓", { at: iso(0, 11, 27) }),
      m("m1-9",  me,
`\`\`\`ts
// client/src/theme/tokens.ts
export const tokens = {
  surface: {
    base:    "var(--c-surface-1)",
    raised:  "var(--c-surface-2)",
    overlay: "rgba(15,23,42,0.04)",
  },
  text: {
    primary:   "var(--c-text-1)",
    secondary: "var(--c-text-2)",
    muted:     "var(--c-text-3)",
  },
};
\`\`\`
이 파일에서 \`surface\` 채도만 한 단계 올리면 전반적으로 따뜻해져요.`,
        { at: iso(0, 11, 27, 30),
          reactions: [
            { userId: alice.id, emoji: "🙏", user: { name: "이앨리스" } },
            { userId: grace.id, emoji: "👀", user: { name: "박그레이스" } },
          ] }),
      m("m1-10", alice, "감사합니다 🙏 오늘 안에 PR 올려둘게요!", { at: iso(0, 11, 35) }),
      m("m1-11", me,    "👍",  { at: iso(0, 11, 36) }),
      m("m1-12", alice, "+ 스프린트 회고 시점 맞춰서 v2.1 같이 묶어서 가는 거 어떠세요?", { at: iso(0, 14, 25) }),
      m("m1-13", me,    "좋습니다. 박그레이스님께도 공유드릴게요.",  { at: iso(0, 14, 30) }),
      m("m1-14", alice, "👍 확인했습니다 — 내일 보고 드릴게요!",     { at: iso(0, 14, 32),
        reactions: [{ userId: me.id, emoji: "🙌", user: { name: DEMO_ME.name } }] }),
    ];
  }

  if (roomId === "r2") {
    // 팀방 — 코드 공유 + 이미지 + 다중 반응
    return [
      m("m2-1", grace, "어제 이슈 났던 결재 리스트 N+1 쿼리 잡았습니다 🔥", { at: iso(-1, 16, 0),
        reactions: [{ userId: me.id, emoji: "🎉", user: { name: DEMO_ME.name } }, { userId: bob.id, emoji: "🔥", user: { name: "박밥" } }] }),
      m("m2-2", grace,
`\`\`\`ts
// before
const list = await prisma.approval.findMany({ ... });
for (const a of list) a.steps = await prisma.approvalStep.findMany({ where: { approvalId: a.id } });

// after — include 한 번에
const list = await prisma.approval.findMany({
  ...,
  include: { steps: { orderBy: { order: "asc" }, include: { reviewer: true } } },
});
\`\`\``, { at: iso(-1, 16, 1) }),
      m("m2-3", bob,   "헐 5초 → 80ms 됐는데요 😱",  { at: iso(-1, 16, 4),
        reactions: [{ userId: grace.id, emoji: "😎", user: { name: "박그레이스" } }] }),
      m("m2-4", me,    "오 좋네요. 운영 메트릭에도 반영해주시면 감사 🙏", { at: iso(-1, 16, 8) }),
      m("m2-5", bob,   "차트로 확인했어요!", { at: iso(0, 11, 0) }),
      m("m2-6", bob,   "perf-2026-05-09.png", {
        at: iso(0, 11, 5), kind: "IMAGE",
        fileUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=720&q=70",
        fileName: "perf-2026-05-09.png", fileType: "image/png", fileSize: 92_400,
        reactions: [
          { userId: grace.id, emoji: "🚀", user: { name: "박그레이스" } },
          { userId: me.id,    emoji: "👏", user: { name: DEMO_ME.name } },
        ],
      }),
    ];
  }

  // 전사 공지방
  return [
    m("m3-1", eve,   "5/15(수) 09:00~10:00 정수기 점검 예정입니다. 양해 부탁드려요 🙏", { at: iso(-1, 9, 30),
      reactions: [{ userId: alice.id, emoji: "👌", user: { name: "이앨리스" } }, { userId: grace.id, emoji: "👍", user: { name: "박그레이스" } }] }),
    m("m3-2", eve,   "본사 1층 카페 무료 음료 쿠폰 배포 중입니다 ☕", { at: iso(0, 9, 5),
      reactions: [{ userId: me.id, emoji: "🙌", user: { name: DEMO_ME.name } }] }),
  ];
}

/* ===== 근태 / 휴가 데모 =====
 *  - 이번 달 평일에 09:00 출근 / 18:00 퇴근. 며칠은 야근(20시), 며칠은 일찍(17시).
 *  - 주말은 빈 행. 오늘은 출근만(퇴근 안 찍음). */
function demoMonthAttendance() {
  const today = new Date(TODAY);
  const y = today.getFullYear();
  const m = today.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const out: any[] = [];
  for (let day = 1; day <= last; day++) {
    const d = new Date(y, m, day);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // 주말 skip
    const date = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isToday = day === today.getDate();
    const isFuture = day > today.getDate();
    if (isFuture) continue;

    // 출근은 09:00 (변동 ±10분), 퇴근은 18:00~20:00 사이 결정.
    const checkIn = new Date(d); checkIn.setHours(9, (day * 7) % 11, 0, 0);
    const variant = day % 5;
    const checkOut = new Date(d);
    if (variant === 0) checkOut.setHours(20, 15, 0, 0);   // 야근
    else if (variant === 1) checkOut.setHours(17, 30, 0, 0); // 일찍
    else checkOut.setHours(18, 5 + (day % 12), 0, 0);

    out.push({
      id: `att-${date}`,
      date,
      checkIn: checkIn.toISOString(),
      checkOut: isToday ? null : checkOut.toISOString(),
    });
  }
  return out;
}

function demoLeaves(all: boolean) {
  const me = { name: DEMO_ME.name, team: DEMO_ME.team };
  const others = [
    { name: "이앨리스",   team: "디자인팀" },
    { name: "박그레이스", team: "개발팀" },
    { name: "한이브",     team: "운영팀" },
  ];
  const my: any[] = [
    { id: "lv1", userId: DEMO_ME.id, type: "ANNUAL", startDate: iso(-14).slice(0, 10), endDate: iso(-14).slice(0, 10), reason: "개인 사유",            status: "APPROVED", user: me },
    { id: "lv2", userId: DEMO_ME.id, type: "HALF",   startDate: iso(7).slice(0, 10),   endDate: iso(7).slice(0, 10),   reason: "병원 진료 (오후)",     status: "PENDING",  user: me },
    { id: "lv3", userId: DEMO_ME.id, type: "ANNUAL", startDate: iso(21).slice(0, 10),  endDate: iso(23).slice(0, 10),  reason: "여름 휴가",             status: "PENDING",  user: me },
  ];
  if (!all) return my;
  return [
    ...my,
    { id: "lv4", userId: "u-lead-1", type: "ANNUAL", startDate: iso(-2).slice(0, 10),  endDate: iso(-2).slice(0, 10),  reason: "결혼식 참석",           status: "APPROVED", user: others[0] },
    { id: "lv5", userId: "u-lead-3", type: "SICK",   startDate: iso(-5).slice(0, 10),  endDate: iso(-5).slice(0, 10),  reason: "감기",                  status: "APPROVED", user: others[1] },
    { id: "lv6", userId: "u-lead-2", type: "ANNUAL", startDate: iso(10).slice(0, 10),  endDate: iso(12).slice(0, 10),  reason: "가족 여행",             status: "PENDING",  user: others[2] },
    { id: "lv7", userId: "u-lead-3", type: "OFFSITE",startDate: iso(2).slice(0, 10),   endDate: iso(2).slice(0, 10),   reason: "외근 (고객사 미팅)",   status: "APPROVED", user: others[1] },
  ];
}

/* ===== 법인카드 지출 데모 ===== */
function demoExpenses() {
  return [
    { id: "ex1", userId: DEMO_ME.id,  usedAt: iso(0, 12, 30),  merchant: "스타벅스 강남점",      category: "식비",   amount:  18000, memo: "팀 미팅",                receiptUrl: null, status: "PENDING",  user: { name: DEMO_ME.name,  team: DEMO_ME.team } },
    { id: "ex2", userId: "u-lead-1",  usedAt: iso(-1, 13, 10), merchant: "본죽 역삼점",          category: "식비",   amount:  12500, memo: "야근 식대",              receiptUrl: null, status: "APPROVED", user: { name: "이앨리스",     team: "디자인팀" } },
    { id: "ex3", userId: DEMO_ME.id,  usedAt: iso(-1, 19, 15), merchant: "카카오T",              category: "교통",   amount:  14300, memo: "외근 복귀",              receiptUrl: null, status: "APPROVED", user: { name: DEMO_ME.name,  team: DEMO_ME.team } },
    { id: "ex4", userId: "u-lead-3",  usedAt: iso(-2, 11, 0),  merchant: "쿠팡",                  category: "비품",   amount:  86000, memo: "키보드 / 마우스",       receiptUrl: null, status: "APPROVED", user: { name: "박그레이스",   team: "개발팀" } },
    { id: "ex5", userId: "u-lead-4",  usedAt: iso(-3, 18, 30), merchant: "더미식 한정식",        category: "접대",   amount: 240000, memo: "외부 미팅 회식",        receiptUrl: null, status: "APPROVED", user: { name: "최마틴",       team: "마케팅팀" } },
    { id: "ex6", userId: DEMO_ME.id,  usedAt: iso(-4, 20, 0),  merchant: "Notion Pro",            category: "업무",   amount:  18000, memo: "월 구독",                receiptUrl: null, status: "APPROVED", user: { name: DEMO_ME.name,  team: DEMO_ME.team } },
    { id: "ex7", userId: "u-lead-2",  usedAt: iso(-5, 9, 30),  merchant: "GS25 본사점",          category: "식비",   amount:   4800, memo: "샌드위치/커피",         receiptUrl: null, status: "APPROVED", user: { name: "한이브",       team: "운영팀" } },
    { id: "ex8", userId: DEMO_ME.id,  usedAt: iso(-7, 14, 20), merchant: "Figma",                 category: "업무",   amount:  20000, memo: "Pro 시트 추가",         receiptUrl: null, status: "APPROVED", user: { name: DEMO_ME.name,  team: DEMO_ME.team } },
  ];
}

/* ===== 서비스 계정 데모 ===== */
function demoAccounts() {
  const me = { id: DEMO_ME.id, name: DEMO_ME.name, avatarColor: DEMO_ME.avatarColor, avatarUrl: null };
  const proj = (id: string) => {
    const p = DEMO_PROJECTS.find((x) => x.id === id);
    return p ? { id: p.id, name: p.name, color: p.color } : null;
  };
  const base = (over: any) => ({
    loginId: over.loginId ?? "team@hinest.app",
    url: over.url ?? null,
    notes: over.notes ?? null,
    scope: over.scope ?? "ALL",
    scopeTeam: null,
    scopeTeams: over.scopeTeams ?? [],
    projectId: over.projectId ?? null,
    projectIds: over.projectId ? [over.projectId] : [],
    project: over.projectId ? proj(over.projectId) : null,
    ownerUser: me,
    ownerName: DEMO_ME.name,
    iconUrl: null,
    iconShape: "SQUIRCLE" as const,
    active: true,
    hasPassword: true,
    createdBy: { id: DEMO_ME.id, name: DEMO_ME.name },
    createdAt: iso(-30),
    updatedAt: iso(-1),
    ...over,
  });
  return [
    base({ id: "sa1", serviceName: "AWS Console",      category: "CLOUD",   loginId: "ops@hinest.app",     url: "https://aws.amazon.com" }),
    base({ id: "sa2", serviceName: "Vercel",           category: "HOSTING", loginId: "deploy@hinest.app",  url: "https://vercel.com",         projectId: "p1" }),
    base({ id: "sa3", serviceName: "GitHub Org",        category: "VCS",     loginId: "github-bot",         url: "https://github.com" }),
    base({ id: "sa4", serviceName: "Stripe",           category: "PAYMENT", loginId: "billing@hinest.app", url: "https://dashboard.stripe.com", scope: "TEAM", scopeTeams: ["재무팀"] }),
    base({ id: "sa5", serviceName: "Cloudflare",       category: "DOMAIN",  loginId: "ops@hinest.app",     url: "https://dash.cloudflare.com" }),
    base({ id: "sa6", serviceName: "Google Workspace", category: "EMAIL",   loginId: "admin@hinest.app",   url: "https://admin.google.com" }),
    base({ id: "sa7", serviceName: "Datadog",          category: "MONITOR", loginId: "ops@hinest.app",     url: "https://app.datadoghq.com",   projectId: "p1" }),
    base({ id: "sa8", serviceName: "OpenAI Platform",  category: "AI",      loginId: "team@hinest.app",    url: "https://platform.openai.com", projectId: "p1" }),
    base({ id: "sa9", serviceName: "RDS Postgres",     category: "DB",      loginId: "hinest",             url: null,                          notes: "운영 DB · IAM 회전 6개월 주기" }),
  ];
}
function projectDetail(id: string) {
  const p = DEMO_PROJECTS.find((x) => x.id === id) ?? DEMO_PROJECTS[0];
  // 간단히 본인 + 임의 멤버 4~6명을 멤버로.
  const members = [DEMO_ME, ...DEMO_USERS.slice(1, 6)].map((u, i) => ({
    id: `m${i}`,
    userId: u.id,
    role: i === 0 ? "OWNER" : i === 1 ? "MANAGER" : "MEMBER",
    user: { id: u.id, name: u.name, avatarColor: u.avatarColor, avatarUrl: null, isDeveloper: (u as any).isDeveloper ?? false, position: u.position, team: u.team, email: u.email },
  }));
  return {
    project: {
      ...p,
      createdBy: { id: DEMO_ME.id, name: DEMO_ME.name },
      members,
    },
  };
}
function approvalCounts() {
  const list = demoApprovalsAll();
  const pending = list.filter((a) => a.status === "PENDING" && a.currentReviewerId === DEMO_ME.id).length;
  const mine = list.filter((a) => a.status === "PENDING" && a.requester.id === DEMO_ME.id).length;
  return { pending, mine };
}
function notificationList() { return { notifications: [], unread: 0 }; }
function featureFlags() { return { flags: {} }; }
function teams() { return { teams: DEMO_TEAMS }; }
function navConfig() { return { items: [] }; }

/** 경로별 매처 — 정확히 일치하거나 prefix 매치. data 는 path 도 받을 수 있어 동적 라우트(예: /api/project/:id) 에서 ID 를 뽑아 다른 응답을 줄 수 있다. */
const HANDLERS: { test: (p: string) => boolean; data: (p?: string) => any }[] = [
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
  { test: (p) => p.startsWith("/api/meeting/mentionable"), data: () => ({ users: DEMO_USERS.slice(0, 8).map((u) => ({ id: u.id, name: u.name, avatarColor: u.avatarColor })) }) },
  { test: (p) => /^\/api\/meeting\/[^/?]+\/revisions/.test(p), data: (p?: string) => ({ revisions: meetingRevisions((p ?? "").match(/\/api\/meeting\/([^/?]+)/)?.[1] ?? "m1") }) },
  { test: (p) => /^\/api\/meeting\/[^/?]+(?:\?|$)/.test(p), data: (p?: string) => meetingDetail((p ?? "").replace(/^\/api\/meeting\//, "").split(/[/?]/)[0]) },
  { test: (p) => p.startsWith("/api/meeting"),         data: meetings },
  // Document revisions — 같은 패턴
  { test: (p) => /^\/api\/document\/[^/?]+\/revisions/.test(p), data: () => ({ revisions: [] }) },
  { test: (p) => p.startsWith("/api/journal"),         data: journalsList },
  { test: (p) => p === "/api/approval/counts",         data: approvalCounts },
  { test: (p) => p.startsWith("/api/approval"),        data: approvals },
  { test: (p) => p.startsWith("/api/notification"),    data: notificationList },
  { test: (p) => p.startsWith("/api/feature-flags"),   data: featureFlags },
  { test: (p) => p.startsWith("/api/nav"),             data: navConfig },
  { test: (p) => p.startsWith("/api/document"),        data: () => ({ documents: [], folders: [] }) },
  { test: (p) => p.startsWith("/api/expense"),         data: () => {
      const list = demoExpenses();
      return { expenses: list, totalAmount: list.reduce((a, e) => a + e.amount, 0) };
    },
  },
  // Chat — 메시지 상세 라우트가 먼저, 그다음 룸 목록.
  { test: (p) => /\/api\/chat\/rooms\/[^/]+\/messages/.test(p), data: (p?: string) => {
      const m = (p ?? "").match(/\/rooms\/([^/]+)\/messages/);
      const id = m?.[1] ?? "r1";
      return { messages: chatMessages(id), readStates: [] };
    },
  },
  { test: (p) => p.startsWith("/api/chat/rooms"),      data: () => ({ rooms: chatRooms() }) },
  { test: (p) => p.startsWith("/api/chat"),            data: () => ({ rooms: chatRooms() }) },
  // 프로젝트 — 하위 경로(events/qa/webhook) 부터 잡고 마지막에 상세/목록.
  { test: (p) => /^\/api\/project\/[^/?]+\/events/.test(p),  data: () => ({ events: [] }) },
  { test: (p) => /^\/api\/project\/[^/?]+\/qa/.test(p),      data: () => ({ items: [] }) },
  { test: (p) => /^\/api\/project\/[^/?]+\/webhook/.test(p), data: () => ({ channels: [] }) },
  { test: (p) => /^\/api\/project\/[^/?]+(?:\?|$)/.test(p),  data: (p?: string) => projectDetail((p ?? "").replace(/^\/api\/project\//, "").split(/[/?]/)[0]) },
  { test: (p) => p.startsWith("/api/project"),               data: projectList },
  { test: (p) => p.startsWith("/api/version"),         data: () => ({ version: "preview" }) },
  { test: (p) => p.startsWith("/api/pins"),            data: () => ({ pins: [] }) },
  { test: (p) => p.startsWith("/api/snippet"),         data: () => ({ snippets: [] }) },

  // Attendance / Leave — 한 달치 출퇴근 + 휴가 데모
  { test: (p) => p.startsWith("/api/attendance/leave"), data: (p?: string) => ({ leaves: demoLeaves(/\?all=1/.test(p ?? "")) }) },
  { test: (p) => p.startsWith("/api/attendance/month"), data: () => ({ attendances: demoMonthAttendance() }) },
  { test: (p) => p.startsWith("/api/attendance"),       data: () => ({ attendances: demoMonthAttendance(), leaves: demoLeaves(false) }) },

  // Document — 데모 폴더 4개 + 문서 6개
  { test: (p) => p.startsWith("/api/document/folders"),  data: () => ({ folders: demoFolders() }) },
  { test: (p) => p.startsWith("/api/document/projects"), data: () => ({ projects: DEMO_PROJECTS.map((x) => ({ id: x.id, name: x.name, color: x.color })) }) },
  { test: (p) => p.startsWith("/api/document"),          data: () => ({ documents: demoDocs(), folders: demoFolders() }) },

  // Service accounts — 데모 계정 8개
  { test: (p) => p.startsWith("/api/service-accounts/projects"), data: () => ({ projects: DEMO_PROJECTS.map((p) => ({ id: p.id, name: p.name, color: p.color })) }) },
  { test: (p) => p.startsWith("/api/service-accounts"), data: () => ({ accounts: demoAccounts() }) },

  // Approval extras
  { test: (p) => p.startsWith("/api/approval-extras/lines"),     data: () => ({ lines: [] }) },
  { test: (p) => p.startsWith("/api/approval-extras/templates"), data: () => ({ templates: [] }) },
  { test: (p) => p.startsWith("/api/approval-extras"),           data: () => ({}) },

  // Profile
  { test: (p) => p.startsWith("/api/profile"),         data: () => ({ user: DEMO_ME }) },

  // Admin — 클라이언트가 기대하는 키 이름에 정확히 맞춤
  { test: (p) => p.startsWith("/api/admin/invites"),        data: () => ({ keys: [] }) }, // ⚠ keys 가 정답
  { test: (p) => p.startsWith("/api/admin/teams"),          data: () => ({ teams: DEMO_TEAMS.map((t, i) => ({ id: `t${i}`, name: t, createdAt: iso(-30) })) }) },
  // 직급 rank 는 \"낮을수록 상위\" — 이사(0) … 인턴(6)
  { test: (p) => p.startsWith("/api/admin/positions"),      data: () => ({ positions: ["이사", "팀장", "리드", "대리", "주임", "사원", "인턴"].map((n, i) => ({ id: `p${i}`, name: n, rank: i, createdAt: iso(-30) })) }) },
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
    return Promise.resolve(jsonResponse(200, handler.data(path)));
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
