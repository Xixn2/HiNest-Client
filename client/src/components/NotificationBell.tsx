import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications, type Notif } from "../notifications";

export default function NotificationBell() {
  const nav = useNavigate();
  const { bellItems, unread, reload, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const visible = tab === "unread" ? bellItems.filter((n) => !n.readAt) : bellItems;

  async function handleClick(n: Notif) {
    if (!n.readAt) await markRead([n.id]);
    if (n.linkUrl) nav(n.linkUrl);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        className="btn-icon relative"
        onClick={() => {
          const willOpen = !open;
          setOpen(willOpen);
          if (willOpen) reload();
        }}
        title="알림"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center tabular">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[360px] panel shadow-pop z-50 p-0 overflow-hidden">
          <div className="section-head">
            <div className="title">알림</div>
            <div className="flex items-center gap-1">
              <div className="tabs">
                <button className={`tab ${tab === "all" ? "tab-active" : ""}`} onClick={() => setTab("all")}>전체</button>
                <button className={`tab ${tab === "unread" ? "tab-active" : ""}`} onClick={() => setTab("unread")}>
                  안읽음 {unread > 0 && <span className="ml-0.5 text-danger tabular">{unread}</span>}
                </button>
              </div>
              {unread > 0 && (
                <button className="text-[11px] font-bold text-brand-600 hover:text-brand-700 ml-2" onClick={() => markRead(undefined, true)}>
                  모두 읽음
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[440px] overflow-auto">
            {visible.length === 0 ? (
              <div className="py-14 text-center">
                <div className="mx-auto w-10 h-10 rounded-xl bg-ink-100 grid place-items-center mb-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8E959E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  </svg>
                </div>
                <div className="text-[12px] text-ink-500">알림이 없어요.</div>
              </div>
            ) : (
              visible.map((n) => <NotifRow key={n.id} n={n} onClick={() => handleClick(n)} />)
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotifRow({ n, onClick }: { n: Notif; onClick: () => void }) {
  const { icon, color } = typeVisuals(n.type);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b border-ink-100 last:border-b-0 hover:bg-ink-25 flex items-start gap-3 ${
        !n.readAt ? "bg-brand-50/30" : ""
      }`}
    >
      <div className={`w-8 h-8 rounded-lg grid place-items-center flex-shrink-0`} style={{ background: color + "20", color }}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {!n.readAt && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 flex-shrink-0" />}
          <div className="text-[13px] font-bold text-ink-900 truncate">{n.title}</div>
        </div>
        {n.body && <div className="text-[12px] text-ink-600 mt-0.5 line-clamp-2">{n.body}</div>}
        <div className="text-[10px] text-ink-400 mt-1 tabular">{formatAgo(new Date(n.createdAt))}</div>
      </div>
    </button>
  );
}

function typeVisuals(t: Notif["type"]) {
  const S = (p: React.ReactNode) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{p}</svg>
  );
  switch (t) {
    case "NOTICE":
      return { icon: S(<><path d="M3 10v4a2 2 0 0 0 2 2h2l8 5V3L7 8H5a2 2 0 0 0-2 2Z" /><path d="M19 8a5 5 0 0 1 0 8" /></>), color: "#DC2626" };
    case "DM":
      return { icon: S(<path d="M4 5h16v11H9l-4 4z" />), color: "#3B5CF0" };
    case "APPROVAL_REQUEST":
      return { icon: S(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>), color: "#D97706" };
    case "APPROVAL_REVIEW":
      return { icon: S(<><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>), color: "#16A34A" };
    case "MENTION":
      return { icon: S(<><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.93" /></>), color: "#0EA5E9" };
    default:
      return { icon: S(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>), color: "#6B7280" };
  }
}

function formatAgo(d: Date) {
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "방금";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}일 전`;
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}
