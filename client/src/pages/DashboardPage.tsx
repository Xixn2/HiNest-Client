import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";

type Notice = { id: string; title: string; content: string; createdAt: string; author: { name: string }; pinned: boolean };
type Event = { id: string; title: string; startAt: string; endAt: string; scope: string; color: string };
type Attendance = { checkIn?: string; checkOut?: string } | null;

export default function DashboardPage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [att, setAtt] = useState<Attendance>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  async function load() {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7).toISOString();
    const [n, s, a] = await Promise.all([
      api<{ notices: Notice[] }>("/api/notice"),
      api<{ events: Event[] }>(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      api<{ attendance: Attendance }>("/api/attendance/today"),
    ]);
    setNotices(n.notices.slice(0, 5));
    setEvents(s.events.slice(0, 6));
    setAtt(a.attendance);
  }

  useEffect(() => {
    load();
  }, []);

  async function checkIn() {
    await api("/api/attendance/check-in", { method: "POST" });
    load();
  }
  async function checkOut() {
    await api("/api/attendance/check-out", { method: "POST" });
    load();
  }

  const status = att?.checkOut ? "퇴근 완료" : att?.checkIn ? "근무 중" : "출근 전";
  const statusClass = att?.checkOut
    ? "chip-gray"
    : att?.checkIn
    ? "chip-green"
    : "chip-amber";
  const statusDot = att?.checkOut ? "#8E959E" : att?.checkIn ? "#16A34A" : "#D97706";

  const workedMinutes = att?.checkIn
    ? Math.max(
        0,
        Math.floor(
          ((att?.checkOut ? new Date(att.checkOut).getTime() : now.getTime()) -
            new Date(att.checkIn).getTime()) /
            60000
        )
      )
    : 0;
  const workedH = Math.floor(workedMinutes / 60);
  const workedM = workedMinutes % 60;

  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div>
      <PageHeader
        eyebrow="개요"
        title={`${user?.name}님, 안녕하세요`}
        description={dateStr}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <KPI label="오늘 상태" value={status} valueClass="text-ink-900" sub={dateStr.split(" ").slice(-1)[0]} badge={<span className={statusClass}><span className="badge-dot" style={{ background: statusDot }} />{status}</span>} />
        <KPI
          label="출근 시각"
          value={att?.checkIn ? new Date(att.checkIn).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
          sub="check-in"
          mono
        />
        <KPI
          label="퇴근 시각"
          value={att?.checkOut ? new Date(att.checkOut).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
          sub="check-out"
          mono
        />
        <KPI
          label="누적 근무"
          value={att?.checkIn ? `${workedH}h ${String(workedM).padStart(2, "0")}m` : "—"}
          sub={att?.checkIn && !att?.checkOut ? "실시간" : "집계 완료"}
          mono
        />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-5">
          {/* 출퇴근 */}
          <div className="panel">
            <div className="section-head">
              <div className="title">근태</div>
              <div className="flex gap-1.5">
                <button className="btn-primary btn-xs" onClick={checkIn}>
                  {att?.checkOut ? "다시 출근" : "출근"}
                </button>
                <button className="btn-ghost btn-xs" disabled={!att?.checkIn || !!att?.checkOut} onClick={checkOut}>
                  {att?.checkOut ? "퇴근 완료" : "퇴근"}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x divide-ink-100">
              <Stat label="출근" value={att?.checkIn ? new Date(att.checkIn).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"} />
              <Stat label="퇴근" value={att?.checkOut ? new Date(att.checkOut).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"} />
              <Stat label="근무시간" value={att?.checkIn ? `${workedH}h ${String(workedM).padStart(2, "0")}m` : "—"} />
            </div>
          </div>

          {/* 일정 */}
          <div className="panel">
            <div className="section-head">
              <div className="title">이번 주 일정 <span className="text-ink-400 font-medium ml-1">{events.length}</span></div>
            </div>
            <div className="divide-y divide-ink-100">
              {events.length === 0 && (
                <div className="py-12 text-center">
                  <div className="t-caption">등록된 일정이 없습니다.</div>
                </div>
              )}
              {events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-25">
                  <div className="w-[3px] h-7 rounded-full" style={{ background: e.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink-900 truncate">{e.title}</div>
                    <div className="text-[11px] text-ink-500 mt-0.5 tabular">
                      {new Date(e.startAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      {" → "}
                      {new Date(e.endAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                  <ScopeBadge scope={e.scope} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* 프로필 요약 */}
          <div className="panel p-5">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full grid place-items-center text-white text-[14px] font-bold"
                style={{ background: user?.avatarColor ?? "#3D54C4" }}
              >
                {user?.name?.[0]}
              </div>
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-ink-900">{user?.name}</div>
                <div className="text-[12px] text-ink-500 truncate">{user?.email}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-ink-100">
              <div>
                <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide">직급</div>
                <div className="text-[13px] font-semibold text-ink-900 mt-1">{user?.position ?? "—"}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide">팀</div>
                <div className="text-[13px] font-semibold text-ink-900 mt-1">{user?.team ?? "—"}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide">권한</div>
                <div className="text-[13px] font-semibold text-ink-900 mt-1 font-mono">{user?.role}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wide">상태</div>
                <div className="mt-1"><span className="chip-green"><span className="badge-dot" style={{ background: "#16A34A" }} />Active</span></div>
              </div>
            </div>
          </div>

          {/* 공지 */}
          <div className="panel">
            <div className="section-head">
              <div className="title">공지사항 <span className="text-ink-400 font-medium ml-1">{notices.length}</span></div>
            </div>
            <div className="divide-y divide-ink-100">
              {notices.length === 0 && (
                <div className="py-10 text-center t-caption">공지가 없습니다.</div>
              )}
              {notices.map((n) => (
                <div key={n.id} className="px-5 py-3 hover:bg-ink-25">
                  <div className="flex items-center gap-2">
                    {n.pinned && <span className="chip-red">PIN</span>}
                    <div className="text-[13px] font-semibold text-ink-900 truncate">{n.title}</div>
                  </div>
                  <div className="text-[11px] text-ink-500 mt-0.5 flex items-center gap-1.5">
                    <span>{n.author?.name}</span>
                    <span className="text-ink-300">·</span>
                    <span className="tabular">{new Date(n.createdAt).toLocaleDateString("ko-KR")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPI({ label, value, sub, badge, mono, valueClass }: { label: string; value: string; sub?: string; badge?: React.ReactNode; mono?: boolean; valueClass?: string }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider">{label}</div>
        {badge}
      </div>
      <div className={`text-[22px] font-bold ${valueClass ?? "text-ink-900"} mt-2 ${mono ? "tabular" : ""}`} style={{ letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-400 mt-1 tabular">{sub}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider">{label}</div>
      <div className="text-[20px] font-bold text-ink-900 mt-1 tabular">{value}</div>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  if (scope === "COMPANY") return <span className="chip-brand">전사</span>;
  if (scope === "TEAM") return <span className="chip-blue">팀</span>;
  return <span className="chip-gray">개인</span>;
}
