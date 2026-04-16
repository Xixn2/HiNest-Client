import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Logo from "./Logo";

const NAV = [
  { to: "/", label: "홈", icon: HomeIcon, end: true },
  { to: "/schedule", label: "일정", icon: CalendarIcon },
  { to: "/attendance", label: "근태·월차", icon: ClockIcon },
  { to: "/journal", label: "업무일지", icon: NoteIcon },
  { to: "/notice", label: "공지", icon: MegaIcon },
  { to: "/chat", label: "사내톡", icon: ChatIcon },
  { to: "/expense", label: "법인카드", icon: CardIcon },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen flex bg-ink-50">
      <aside className="w-[236px] bg-white border-r border-ink-100 flex flex-col flex-shrink-0">
        <div className="px-6 py-6">
          <Logo />
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-bold transition ${
                    isActive
                      ? "bg-brand-50 text-brand-600"
                      : "text-ink-700 hover:bg-ink-50"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon active={isActive} />
                    <span>{n.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}

          {user?.role === "ADMIN" && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-bold transition mt-2 ${
                  isActive ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-50"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <ShieldIcon active={isActive} />
                  <span>관리자</span>
                </>
              )}
            </NavLink>
          )}
        </nav>

        <div className="p-3 border-t border-ink-100">
          <div className="flex items-center gap-3 px-2 py-2">
            <div
              className="w-10 h-10 rounded-full grid place-items-center text-white font-extrabold"
              style={{ background: user?.avatarColor ?? "#3182F6" }}
            >
              {user?.name?.[0] ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-extrabold text-ink-900 truncate tracking-tight">
                {user?.name}
              </div>
              <div className="text-xs text-ink-500 truncate">
                {user?.position ?? user?.role}
              </div>
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              nav("/login");
            }}
            className="w-full mt-2 py-2.5 rounded-xl text-[13px] font-bold text-ink-600 hover:bg-ink-50"
          >
            로그아웃
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <div className="max-w-[1400px] mx-auto px-10 py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/* ---------- icons (flat toss-style) ---------- */
type I = { active?: boolean };
const stroke = (a?: boolean) => (a ? "#3182F6" : "#4E5968");
const strokeInv = (a?: boolean) => (a ? "#fff" : "#4E5968");

function HomeIcon({ active }: I) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9v11h14V9" />
    </svg>
  );
}
function CalendarIcon({ active }: I) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function ClockIcon({ active }: I) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function NoteIcon({ active }: I) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h12l4 4v12H4z" />
      <path d="M8 12h8M8 16h6M8 8h5" />
    </svg>
  );
}
function MegaIcon({ active }: I) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11v2a2 2 0 0 0 2 2h2l8 5V4L7 9H5a2 2 0 0 0-2 2Z" />
      <path d="M19 8a5 5 0 0 1 0 8" />
    </svg>
  );
}
function ChatIcon({ active }: I) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16v12H8l-4 4z" />
    </svg>
  );
}
function CardIcon({ active }: I) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke(active)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 11h18M7 16h4" />
    </svg>
  );
}
function ShieldIcon({ active }: I) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={strokeInv(active)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
