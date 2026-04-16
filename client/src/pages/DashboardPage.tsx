import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";

type Notice = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  author: { name: string };
  pinned: boolean;
};
type Event = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  scope: string;
  color: string;
};
type Attendance = { checkIn?: string; checkOut?: string } | null;

export default function DashboardPage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [att, setAtt] = useState<Attendance>(null);

  async function load() {
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7).toISOString();
    const [n, s, a] = await Promise.all([
      api<{ notices: Notice[] }>("/api/notice"),
      api<{ events: Event[] }>(
        `/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      ),
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

  const today = new Date();
  const dateStr = today.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div>
      <PageHeader title={`${user?.name}님, 안녕하세요 👋`} description={dateStr} />

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-5">
          {/* 오늘의 근태 */}
          <div className="card">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="h-sub">오늘의 근태</div>
                <div className="t-caption mt-1">출·퇴근 시각을 기록하세요</div>
              </div>
              <div className="chip bg-brand-50 text-brand-600">
                {att?.checkIn && !att?.checkOut
                  ? "근무중"
                  : att?.checkOut
                  ? "퇴근 완료"
                  : "출근 전"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-ink-50 p-5">
                <div className="text-[13px] font-bold text-ink-600">출근</div>
                <div className="text-[32px] font-extrabold tracking-tighter text-ink-900 mt-2">
                  {att?.checkIn
                    ? new Date(att.checkIn).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : "--:--"}
                </div>
                <button
                  className="btn-primary w-full mt-4"
                  disabled={!!att?.checkIn}
                  onClick={checkIn}
                >
                  {att?.checkIn ? "출근 완료" : "출근하기"}
                </button>
              </div>
              <div className="rounded-2xl bg-ink-50 p-5">
                <div className="text-[13px] font-bold text-ink-600">퇴근</div>
                <div className="text-[32px] font-extrabold tracking-tighter text-ink-900 mt-2">
                  {att?.checkOut
                    ? new Date(att.checkOut).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })
                    : "--:--"}
                </div>
                <button
                  className="btn-ghost w-full mt-4"
                  disabled={!att?.checkIn || !!att?.checkOut}
                  onClick={checkOut}
                >
                  {att?.checkOut ? "퇴근 완료" : "퇴근하기"}
                </button>
              </div>
            </div>
          </div>

          {/* 이번주 일정 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="h-sub">이번 주 일정</div>
              <span className="t-caption">{events.length}건</span>
            </div>
            <div className="space-y-1">
              {events.length === 0 && (
                <div className="py-10 text-center t-caption">등록된 일정이 없어요.</div>
              )}
              {events.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-4 p-3 rounded-xl hover:bg-ink-50"
                >
                  <div
                    className="w-1.5 h-10 rounded-full"
                    style={{ background: e.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-extrabold text-ink-900 tracking-tight">
                      {e.title}
                    </div>
                    <div className="t-caption mt-0.5">
                      {new Date(e.startAt).toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      ~{" "}
                      {new Date(e.endAt).toLocaleString("ko-KR", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <span className="chip bg-ink-100 text-ink-700">
                    {e.scope === "COMPANY" ? "전사" : e.scope === "TEAM" ? "팀" : "개인"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* 내 정보 */}
          <div className="card bg-ink-900 border-ink-900 text-white">
            <div className="text-[13px] font-bold text-ink-300">나의 정보</div>
            <div className="text-[22px] font-extrabold tracking-tight mt-4">
              {user?.name}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-white/10">
              <div>
                <div className="text-[12px] text-ink-300 font-bold">직급</div>
                <div className="text-[16px] font-extrabold mt-1">
                  {user?.position ?? "-"}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-ink-300 font-bold">팀</div>
                <div className="text-[16px] font-extrabold mt-1">{user?.team ?? "-"}</div>
              </div>
            </div>
          </div>

          {/* 공지 */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <div className="h-sub">공지사항</div>
              <span className="t-caption">{notices.length}건</span>
            </div>
            <div className="space-y-1">
              {notices.length === 0 && (
                <div className="py-10 text-center t-caption">공지가 없습니다.</div>
              )}
              {notices.map((n) => (
                <div key={n.id} className="p-3 rounded-xl hover:bg-ink-50">
                  <div className="flex items-center gap-2">
                    {n.pinned && (
                      <span className="chip bg-danger/10 text-danger">고정</span>
                    )}
                    <div className="font-extrabold text-ink-900 truncate tracking-tight">
                      {n.title}
                    </div>
                  </div>
                  <div className="t-caption mt-1">
                    {n.author?.name} ·{" "}
                    {new Date(n.createdAt).toLocaleDateString("ko-KR")}
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
