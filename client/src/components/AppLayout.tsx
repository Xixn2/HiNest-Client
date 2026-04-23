import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { api } from "../api";
import Logo from "./Logo";
import NotificationBell from "./NotificationBell";
import SearchModal from "./SearchModal";
import ChatFab from "./ChatFab";
import CreateProjectModal from "./CreateProjectModal";
import { NotificationProvider, useNotifications } from "../notifications";
import { PinsProvider, usePins, pinLinkUrl } from "../pins";
import { ROUTE_PREFETCH, loadProject } from "../routes";

/**
 * 사이드바 hover/focus prefetch — 사용자가 클릭하기 전에 해당 페이지 청크를
 * 백그라운드로 받아둔다. 같은 dynamic import 는 Vite 가 캐시해서 중복 요청 없음.
 * 실패해도 실제 네비게이션 시 다시 시도되므로 조용히 무시.
 */
function prefetchRoute(to: string) {
  try {
    if (to.startsWith("/projects/")) {
      void loadProject();
      return;
    }
    const fn = ROUTE_PREFETCH[to];
    if (fn) void fn();
  } catch {}
}

type NavItem = { to: string; label: string; icon: (p: { active?: boolean }) => JSX.Element; end?: boolean };

const WORK_NAV: NavItem[] = [
  { to: "/", label: "개요", icon: HomeIcon, end: true },
  { to: "/schedule", label: "일정", icon: CalendarIcon },
  { to: "/attendance", label: "근태·월차", icon: ClockIcon },
  { to: "/journal", label: "업무일지", icon: NoteIcon },
  { to: "/meetings", label: "회의록", icon: MeetingIcon },
  { to: "/approvals", label: "전자결재", icon: ApprovalIcon },
];

// 사내톡은 사이드바에서 제거 — 우하단 ChatFab 팝업에서만 접근.
const COMM_NAV: NavItem[] = [
  { to: "/notice", label: "공지사항", icon: MegaIcon },
  { to: "/directory", label: "팀원", icon: PeopleIcon },
  { to: "/org", label: "조직도", icon: OrgIcon },
];

const RESOURCE_NAV: NavItem[] = [
  { to: "/documents", label: "문서함", icon: DocsIcon },
  { to: "/expense", label: "법인카드", icon: CardIcon },
];

export default function AppLayout() {
  return (
    <NotificationProvider>
      <PinsProvider>
        <AppLayoutInner />
      </PinsProvider>
    </NotificationProvider>
  );
}

function AppLayoutInner() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const isMacDesktop = !!window.hinest?.isDesktop && window.hinest?.platform === "darwin";
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 모바일 사이드바 드로어 — md 미만에서만 의미 있음 (md 이상은 항상 고정 배치)
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isMacDesktop || !window.hinest?.onFullscreenChange) return;
    const off = window.hinest.onFullscreenChange((fs) => setIsFullscreen(fs));
    return () => {
      try { off?.(); } catch {}
    };
  }, [isMacDesktop]);

  // 라우트가 바뀌면 드로어는 자동으로 닫는다 — 모바일에서 탭하면 같은 창 위로
  // 메뉴가 덮여 있어 바로 닫혀야 자연스럽다.
  useEffect(() => { setMobileNavOpen(false); }, [loc.pathname]);
  // 드로어 열렸을 때 body 스크롤 잠금 — 데스크톱에는 영향 없음.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileNavOpen]);

  // 창모드에서만 신호등 버튼 여백 필요, 전체화면에선 숨어있으므로 여백 제거
  const showTitlebarSpace = isMacDesktop && !isFullscreen;

  return (
    <div className="h-screen flex bg-ink-50 overflow-hidden">
      {/* 모바일 드로어 백드롭 — md 미만에서 열렸을 때만 보임 */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`
          w-[232px] bg-white border-r border-ink-150 flex flex-col flex-shrink-0
          md:static md:translate-x-0
          fixed inset-y-0 left-0 z-40
          transition-transform duration-200 ease-out
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* 신호등 영역용 드래그 가능 상단바 — 사이드바 배경과 통일 */}
        {showTitlebarSpace && (
          <div
            style={{
              height: 28,
              // @ts-expect-error drag region
              WebkitAppRegion: "drag",
            }}
          />
        )}
        <div className="h-[48px] px-5 flex items-center border-b border-ink-150">
          <Logo size={20} />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5">
          <NavSection label="워크스페이스" items={WORK_NAV} />
          <NavSection label="커뮤니케이션" items={COMM_NAV} />
          <NavSection label="자료·재무" items={RESOURCE_NAV} />
          <PinsSection />
          <ProjectsSection />

          {user?.role === "ADMIN" && (
            <div>
              <SectionLabel>관리</SectionLabel>
              <NavLink
                to="/admin"
                className={({ isActive }) => navClass(isActive)}
                onMouseEnter={() => prefetchRoute("/admin")}
                onFocus={() => prefetchRoute("/admin")}
              >
                {({ isActive }) => (<><ShieldIcon active={isActive} /><span>관리자</span></>)}
              </NavLink>
              {user?.superAdmin && (
                <NavLink
                  to="/super-admin"
                  className={({ isActive }) => navClass(isActive)}
                  onMouseEnter={() => prefetchRoute("/super-admin")}
                  onFocus={() => prefetchRoute("/super-admin")}
                >
                  {({ isActive }) => (<><CrownIcon active={isActive} /><span>총관리자</span></>)}
                </NavLink>
              )}
            </div>
          )}
        </nav>

        {/* 앱 다운로드 — 웹 브라우저로 접속한 경우에만. Electron 에서는 숨김. */}
        {!window.hinest?.isDesktop && (
          <div className="border-t border-ink-150 px-2 pt-2">
            <NavLink
              to="/download"
              className="flex items-center gap-2.5 h-[32px] px-3 rounded-full text-[12.5px] font-semibold text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition"
              title="데스크톱 · 모바일 앱 다운로드"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>앱 다운로드</span>
            </NavLink>
          </div>
        )}

        <div className="border-t border-ink-150 p-2">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-ink-50">
            <NavLink to="/profile" className="flex items-center gap-2.5 flex-1 min-w-0" title="프로필">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.name ?? ""}
                  className="avatar avatar-sm object-cover"
                />
              ) : (
                <div
                  className="avatar avatar-sm"
                  style={{ background: user?.avatarColor ?? "#3B5CF0" }}
                >
                  {user?.name?.[0] ?? "?"}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink-900 truncate">{user?.name}</div>
                <div className="text-[11px] text-ink-500 truncate">{user?.email}</div>
              </div>
            </NavLink>
            <button
              onClick={async () => {
                await logout();
                nav("/login");
              }}
              className="btn-icon"
              title="로그아웃"
              aria-label="로그아웃"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4" />
                <path d="m16 17 5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        {showTitlebarSpace && (
          <div
            className="bg-white"
            style={{
              height: 28,
              // @ts-expect-error drag region
              WebkitAppRegion: "drag",
            }}
          />
        )}
        <TopBar draggable={showTitlebarSpace} onOpenNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-4 md:py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <ChatFab />
    </div>
  );
}

function NavSection({ label, items }: { label: string; items: NavItem[] }) {
  // 공지사항 미읽음 알림 개수 — 사이드바에 배지로 표시
  const { bellItems, ready } = useNotifications();
  const noticeUnread = bellItems.filter((n) => n.type === "NOTICE" && !n.readAt).length;

  // 새 공지가 들어왔을 때만 파란 펄스.
  // - 새로고침/재오픈은 localStorage 마지막 본 카운트와 비교해 증가하지 않으면 패스.
  // - 앱 꺼진 사이 공지가 쌓였다면 켤 때 1회 발동.
  const [noticePulse, setNoticePulse] = useState(false);
  useEffect(() => {
    if (!ready) return;
    const KEY = "hinest:lastSeenNoticeUnread";
    const lastSeen = Number(localStorage.getItem(KEY) ?? "0");
    if (noticeUnread > lastSeen) {
      setNoticePulse(true);
      const t = setTimeout(() => setNoticePulse(false), 2800);
      localStorage.setItem(KEY, String(noticeUnread));
      return () => clearTimeout(t);
    }
    localStorage.setItem(KEY, String(noticeUnread));
  }, [noticeUnread, ready]);

  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="space-y-0.5">
        {items.map((n) => {
          const Icon = n.icon;
          const badgeCount = n.to === "/notice" ? noticeUnread : 0;
          const pulseHere = n.to === "/notice" && noticePulse;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => navClass(isActive) + (pulseHere ? " siri-pulse-bg" : "")}
              onMouseEnter={() => prefetchRoute(n.to)}
              onFocus={() => prefetchRoute(n.to)}
            >
              {({ isActive }) => (
                <>
                  <Icon active={isActive} />
                  <span className="flex-1">{n.label}</span>
                  {badgeCount > 0 && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1.5 rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center tabular">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

type ProjectLite = {
  id: string;
  name: string;
  color: string;
  status: "ACTIVE" | "ARCHIVED";
};

/**
 * 사이드바 "팀" 섹션 — 내가 참여중인 프로젝트 목록.
 * - 아직 참여 프로젝트가 없어도 섹션 자체는 노출해서 "여기가 프로젝트 모이는 곳이다" 를 알 수 있게.
 * - 활성 프로젝트만 기본 노출, ARCHIVED 는 숨김.
 */
function ProjectsSection() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // ADMIN 은 본인이 멤버가 아니어도 전체 프로젝트를 사이드바에서 열람.
  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    let alive = true;
    api<{ projects: ProjectLite[] }>(isAdmin ? "/api/project?all=1" : "/api/project")
      .then((r) => {
        if (!alive) return;
        setProjects(r.projects);
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [isAdmin, reloadKey]);

  const active = projects.filter((p) => p.status === "ACTIVE");

  return (
    <div>
      <div className="flex items-center justify-between pr-1">
        <SectionLabel>프로젝트</SectionLabel>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setOpenCreate(true)}
            className="w-5 h-5 mb-1.5 grid place-items-center rounded-full text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition"
            title="새 프로젝트"
            aria-label="새 프로젝트"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        )}
      </div>
      <div className="space-y-0.5">
        {active.map((p) => (
          <NavLink
            key={p.id}
            to={`/projects/${p.id}`}
            className={({ isActive }) => navClass(isActive)}
            onMouseEnter={() => prefetchRoute(`/projects/${p.id}`)}
            onFocus={() => prefetchRoute(`/projects/${p.id}`)}
          >
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: p.color }}
            />
            <span className="flex-1 truncate">{p.name}</span>
          </NavLink>
        ))}
        {loaded && active.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-ink-400">
            참여중인 프로젝트가 없습니다.
          </div>
        )}
      </div>
      {isAdmin && (
        <CreateProjectModal
          open={openCreate}
          onClose={() => setOpenCreate(false)}
          onCreated={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

/**
 * 즐겨찾기(핀) — 문서·회의록·공지·프로젝트·채팅방을 한 곳에 모은다.
 * 드래그로 순서 재정렬 가능. 없으면 섹션 자체 숨김.
 */
function PinsSection() {
  const { pins, ready, reorder, toggle } = usePins();
  const nav = useNavigate();
  const [dragId, setDragId] = useState<string | null>(null);

  if (!ready || pins.length === 0) return null;

  const handleClick = (p: typeof pins[number]) => {
    const url = pinLinkUrl(p);
    if (url.startsWith("#chat:")) {
      const roomId = url.slice("#chat:".length);
      window.dispatchEvent(new CustomEvent("chat:open"));
      window.dispatchEvent(new CustomEvent("chat:open-room", { detail: { roomId } }));
    } else {
      nav(url);
    }
  };

  const onDrop = (overId: string) => {
    if (!dragId || dragId === overId) { setDragId(null); return; }
    const ids = pins.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1) { setDragId(null); return; }
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    reorder(next);
    setDragId(null);
  };

  return (
    <div>
      <SectionLabel>즐겨찾기</SectionLabel>
      <div className="space-y-0.5">
        {pins.map((p) => {
          const label = p.label ?? p.name ?? "삭제된 항목";
          const icon = PIN_TYPE_ICON[p.targetType as keyof typeof PIN_TYPE_ICON] ?? "•";
          return (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDrop={(e) => { e.preventDefault(); onDrop(p.id); }}
              onDragEnd={() => setDragId(null)}
              className={`group flex items-center gap-2 h-[40px] md:h-[30px] px-3 rounded-full text-[12.5px] font-semibold cursor-pointer transition ${
                dragId === p.id ? "opacity-40" : ""
              } ${p.missing ? "text-ink-400" : "text-ink-700 hover:bg-ink-100 hover:text-ink-900"}`}
              title={p.missing ? "원본이 삭제되었어요 — 클릭해서 핀 해제" : label}
              onClick={() => (p.missing ? toggle(p.targetType, p.targetId) : handleClick(p))}
            >
              <span className="text-[11px] opacity-70">{icon}</span>
              <span className="flex-1 truncate">{label}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggle(p.targetType, p.targetId); }}
                className="md:opacity-0 md:group-hover:opacity-100 w-4 h-4 grid place-items-center rounded text-ink-400 hover:text-ink-900"
                title="핀 해제"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PIN_TYPE_ICON = {
  DOCUMENT: "📄",
  MEETING: "🗒",
  NOTICE: "📢",
  PROJECT: "◆",
  CHAT_ROOM: "💬",
} as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 mb-1.5 text-[10px] font-bold text-ink-500 uppercase tracking-[0.08em]">
      {children}
    </div>
  );
}

function navClass(active: boolean) {
  return [
    "flex items-center gap-2.5 h-[40px] md:h-[34px] px-3 rounded-full text-[13px] font-bold transition",
    active ? "nav-active" : "text-ink-700 hover:bg-ink-100 hover:text-ink-900",
  ].join(" ");
}

/* ---------- TopBar ---------- */
const BREADCRUMB: Record<string, string> = {
  "/": "개요",
  "/schedule": "일정",
  "/attendance": "근태·월차",
  "/journal": "업무일지",
  "/notice": "공지사항",
  "/directory": "팀원",
  "/org": "조직도",
  "/documents": "문서함",
  "/approvals": "전자결재",
  "/expense": "법인카드",
  "/admin": "관리자",
  "/super-admin": "총관리자",
  "/profile": "내 프로필",
};

function TopBar({ draggable = false, onOpenNav }: { draggable?: boolean; onOpenNav?: () => void }) {
  const loc = useLocation();
  const label = loc.pathname.startsWith("/projects/")
    ? "프로젝트"
    : BREADCRUMB[loc.pathname] ?? "";
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      // Cmd+T — 사내톡 팝업 토글 (ChatFab 이 전역 이벤트로 받음)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("chat:toggle"));
      }
      if (e.key === "Escape" && searchOpen) setSearchOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  return (
    <>
      <header
        className="h-[48px] flex items-center justify-between px-3 md:px-6 border-b border-ink-150 bg-white"
        style={draggable ? ({ WebkitAppRegion: "drag" } as React.CSSProperties) : undefined}
      >
        <div
          className="flex items-center gap-2 text-[13px] min-w-0"
          style={draggable ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
        >
          {/* 모바일 햄버거 — md 이상은 숨김 */}
          {onOpenNav && (
            <button
              type="button"
              className="md:hidden w-9 h-9 -ml-1 mr-0.5 grid place-items-center rounded-full text-ink-700 hover:bg-ink-100"
              onClick={onOpenNav}
              title="메뉴"
              aria-label="메뉴 열기"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          )}
          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--c-brand)" }} />
          <span className="text-ink-900 font-bold truncate">{label || "HiNest"}</span>
        </div>

        <div
          className="flex items-center gap-2"
          style={draggable ? ({ WebkitAppRegion: "no-drag" } as React.CSSProperties) : undefined}
        >
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 h-[34px] px-4 rounded-full bg-ink-50 border border-ink-150 text-ink-500 text-[12px] hover:bg-ink-100 hover:border-ink-200 min-w-[260px]"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="flex-1 text-left">검색</span>
            <span className="kbd">⌘K</span>
          </button>
          <NotificationBell />
        </div>
      </header>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

/* ---------- Icons ---------- */
type I = { active?: boolean };
const swInv = (a?: boolean) => (a ? "#fff" : "#6B7280");

function svgBase(_active: boolean, path: React.ReactNode) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}
function HomeIcon({ active }: I) { return svgBase(!!active, <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h4v-6h6v6h4V9.5" /></>); }
function CalendarIcon({ active }: I) { return svgBase(!!active, <><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>); }
function ClockIcon({ active }: I) { return svgBase(!!active, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>); }
function NoteIcon({ active }: I) { return svgBase(!!active, <><path d="M5 4h10l4 4v12H5z" /><path d="M14 4v5h5M8 13h8M8 16h5" /></>); }
function MeetingIcon({ active }: I) { return svgBase(!!active, <><path d="M4 5h16v11H4z" /><path d="M4 5 12 12l8-7" /><path d="M8 20h8M12 16v4" /></>); }
function MegaIcon({ active }: I) { return svgBase(!!active, <><path d="M3 10v4a2 2 0 0 0 2 2h2l8 5V3L7 8H5a2 2 0 0 0-2 2Z" /><path d="M19 8a5 5 0 0 1 0 8" /></>); }
function PeopleIcon({ active }: I) { return svgBase(!!active, <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>); }
function OrgIcon({ active }: I) { return svgBase(!!active, <><rect x="8" y="3" width="8" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><path d="M12 9v3M6 15v-3h12v3" /></>); }
function DocsIcon({ active }: I) { return svgBase(!!active, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>); }
function ApprovalIcon({ active }: I) { return svgBase(!!active, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 14 2 2 4-4" /></>); }
function CardIcon({ active }: I) { return svgBase(!!active, <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 11h18M7 16h4" /></>); }
function ShieldIcon({ active }: I) { return svgBase(!!active, <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>); }
function CrownIcon({ active }: I) { return svgBase(!!active, <><path d="M3 18h18" /><path d="M3 8l4 5 5-8 5 8 4-5v10H3z" /></>); }
const _unused_swInv = swInv;
