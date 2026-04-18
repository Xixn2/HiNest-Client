import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Logo from "./Logo";
import NotificationBell from "./NotificationBell";
import SearchModal from "./SearchModal";
import ChatFab from "./ChatFab";
import { NotificationProvider } from "../notifications";

type NavItem = { to: string; label: string; icon: (p: { active?: boolean }) => JSX.Element; end?: boolean };

const WORK_NAV: NavItem[] = [
  { to: "/", label: "개요", icon: HomeIcon, end: true },
  { to: "/schedule", label: "일정", icon: CalendarIcon },
  { to: "/attendance", label: "근태·월차", icon: ClockIcon },
  { to: "/journal", label: "업무일지", icon: NoteIcon },
  { to: "/approvals", label: "전자결재", icon: ApprovalIcon },
];

const COMM_NAV: NavItem[] = [
  { to: "/notice", label: "공지사항", icon: MegaIcon },
  { to: "/chat", label: "사내톡", icon: ChatIcon },
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
      <AppLayoutInner />
    </NotificationProvider>
  );
}

function AppLayoutInner() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const isMacDesktop = !!window.hinest?.isDesktop && window.hinest?.platform === "darwin";
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isMacDesktop || !window.hinest?.onFullscreenChange) return;
    const off = window.hinest.onFullscreenChange((fs) => setIsFullscreen(fs));
    return () => {
      try { off?.(); } catch {}
    };
  }, [isMacDesktop]);

  // 창모드에서만 신호등 버튼 여백 필요, 전체화면에선 숨어있으므로 여백 제거
  const showTitlebarSpace = isMacDesktop && !isFullscreen;

  return (
    <div className="h-screen flex bg-ink-50 overflow-hidden">
      <aside className="w-[232px] bg-white border-r border-ink-150 flex flex-col flex-shrink-0">
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

          {user?.role === "ADMIN" && (
            <div>
              <SectionLabel>관리</SectionLabel>
              <NavLink to="/admin" className={({ isActive }) => navClass(isActive)}>
                {({ isActive }) => (<><ShieldIcon active={isActive} /><span>관리자</span></>)}
              </NavLink>
              {user?.superAdmin && (
                <NavLink to="/super-admin" className={({ isActive }) => navClass(isActive)}>
                  {({ isActive }) => (<><CrownIcon active={isActive} /><span>총관리자</span></>)}
                </NavLink>
              )}
            </div>
          )}
        </nav>

        <div className="border-t border-ink-150 p-2">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-ink-50">
            <NavLink to="/profile" className="flex items-center gap-2.5 flex-1 min-w-0" title="프로필">
              <div
                className="avatar avatar-sm"
                style={{ background: user?.avatarColor ?? "#3B5CF0" }}
              >
                {user?.name?.[0] ?? "?"}
              </div>
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
        <TopBar draggable={showTitlebarSpace} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-8 py-6">
            <Outlet />
          </div>
        </main>
      </div>
      <ChatFab />
    </div>
  );
}

function NavSection({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="space-y-0.5">
        {items.map((n) => {
          const Icon = n.icon;
          return (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => navClass(isActive)}>
              {({ isActive }) => (
                <>
                  <Icon active={isActive} />
                  <span>{n.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 mb-1.5 text-[10px] font-bold text-ink-500 uppercase tracking-[0.08em]">
      {children}
    </div>
  );
}

function navClass(active: boolean) {
  return [
    "flex items-center gap-2.5 h-[34px] px-3 rounded-full text-[13px] font-bold transition",
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
  "/chat": "사내톡",
  "/directory": "팀원",
  "/org": "조직도",
  "/documents": "문서함",
  "/approvals": "전자결재",
  "/expense": "법인카드",
  "/admin": "관리자",
  "/super-admin": "총관리자",
  "/profile": "내 프로필",
};

function TopBar({ draggable = false }: { draggable?: boolean }) {
  const loc = useLocation();
  const label = BREADCRUMB[loc.pathname] ?? "";
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape" && searchOpen) setSearchOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  return (
    <>
      <header
        className="h-[48px] flex items-center justify-between px-6 border-b border-ink-150 bg-white"
        style={draggable ? ({ WebkitAppRegion: "drag" } as React.CSSProperties) : undefined}
      >
        <div className="flex items-center gap-2 text-[13px]">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--c-brand)" }} />
          <span className="text-ink-900 font-bold">{label || "HiNest"}</span>
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
function MegaIcon({ active }: I) { return svgBase(!!active, <><path d="M3 10v4a2 2 0 0 0 2 2h2l8 5V3L7 8H5a2 2 0 0 0-2 2Z" /><path d="M19 8a5 5 0 0 1 0 8" /></>); }
function ChatIcon({ active }: I) { return svgBase(!!active, <><path d="M4 5h16v11H9l-4 4z" /></>); }
function PeopleIcon({ active }: I) { return svgBase(!!active, <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>); }
function OrgIcon({ active }: I) { return svgBase(!!active, <><rect x="8" y="3" width="8" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><rect x="15" y="15" width="6" height="6" rx="1" /><path d="M12 9v3M6 15v-3h12v3" /></>); }
function DocsIcon({ active }: I) { return svgBase(!!active, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>); }
function ApprovalIcon({ active }: I) { return svgBase(!!active, <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="m9 14 2 2 4-4" /></>); }
function CardIcon({ active }: I) { return svgBase(!!active, <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 11h18M7 16h4" /></>); }
function ShieldIcon({ active }: I) { return svgBase(!!active, <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>); }
function CrownIcon({ active }: I) { return svgBase(!!active, <><path d="M3 18h18" /><path d="M3 8l4 5 5-8 5 8 4-5v10H3z" /></>); }
const _unused_swInv = swInv;
