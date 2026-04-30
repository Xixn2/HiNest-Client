import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import InstallAppBanner from "../components/InstallAppBanner";
import { confirmAsync, alertAsync } from "../components/ConfirmHost";
import { isDevAccount, DevBadge } from "../lib/devBadge";

type Notice = { id: string; title: string; content: string; createdAt: string; author: { name: string; isDeveloper?: boolean }; pinned: boolean };
type Event = { id: string; title: string; startAt: string; endAt: string; scope: string; color: string };
type Attendance = { checkIn?: string; checkOut?: string } | null;

/**
 * 개요(Dashboard) — 진입 첫 화면.
 * 디자인 의도:
 *  - 첫 인상은 정보 나열 X, "오늘 어디까지 왔나" 가 한 눈에. 큰 그라데이션 히어로 + 진행 막대.
 *  - 출퇴근/일정/공지 의 정보 밀도는 유지하되, 시각적 톤은 패널의 높낮이/색띠로 정돈.
 *  - 빠른 액션(새 일정/일지/회의록/결재) 을 한 줄로 깔아 클릭 1번에 자주 쓰는 흐름을 시작.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [att, setAtt] = useState<Attendance>(null);
  const [now, setNow] = useState(new Date());

  // 1초 단위 시계 — 히어로의 진행 막대도 같이 살아있게.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const aliveRef = useRef(true);
  const loadTokenRef = useRef(0);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  async function load() {
    const myToken = ++loadTokenRef.current;
    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7).toISOString();
    const [n, s, a] = await Promise.all([
      api<{ notices: Notice[] }>("/api/notice"),
      api<{ events: Event[] }>(`/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      api<{ attendance: Attendance }>("/api/attendance/today"),
    ]);
    if (!aliveRef.current || myToken !== loadTokenRef.current) return;
    setNotices(n.notices.slice(0, 5));
    setEvents(s.events.slice(0, 6));
    setAtt(a.attendance);
  }
  useEffect(() => { load(); }, []);

  async function checkIn() {
    try {
      await api("/api/attendance/check-in", { method: "POST" });
    } catch (err: any) {
      if (err?.code === "ALREADY_CHECKED_OUT") {
        const ok = await confirmAsync({
          title: "재출근",
          description: "오늘은 이미 퇴근 처리되었어요. 재출근으로 덮어쓸까요?\n(기존 퇴근 시각이 초기화됩니다)",
          confirmLabel: "재출근",
        });
        if (!ok) return;
        try {
          await api("/api/attendance/check-in", { method: "POST", json: { force: true } });
        } catch (e: any) {
          alertAsync({ title: "출근 실패", description: e?.message ?? "출근 처리에 실패했어요" });
          return;
        }
      } else {
        alertAsync({ title: "출근 실패", description: err?.message ?? "출근 처리에 실패했어요" });
        return;
      }
    }
    load();
  }
  async function checkOut() {
    try {
      await api("/api/attendance/check-out", { method: "POST" });
    } catch (err: any) {
      alertAsync({ title: "퇴근 실패", description: err?.message ?? "퇴근 처리에 실패했어요" });
      return;
    }
    load();
  }

  /* ===== 파생 값 ===== */
  const greeting = useMemo(() => greetingFor(now), [now]);
  const dateLabel = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const clock = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

  const status: WorkStatus = att?.checkOut ? "OFF" : att?.checkIn ? "IN" : "NONE";
  const workedMin = att?.checkIn
    ? Math.max(0, Math.floor(((att.checkOut ? new Date(att.checkOut).getTime() : now.getTime()) - new Date(att.checkIn).getTime()) / 60000))
    : 0;
  const workedH = Math.floor(workedMin / 60);
  const workedM = workedMin % 60;

  // 진행률 — 9:00 출근 ~ 18:00 퇴근 기준. checkIn 있으면 실제 시간 반영.
  const dayStartH = 9;
  const dayEndH = 18;
  const dayProgress = useMemo(() => {
    const h = now.getHours() + now.getMinutes() / 60;
    return Math.max(0, Math.min(1, (h - dayStartH) / (dayEndH - dayStartH)));
  }, [now]);

  return (
    <div className="space-y-5">
      <InstallAppBanner />

      {/* ========= HERO ========= */}
      <Hero
        greeting={greeting}
        userName={user?.name ?? ""}
        userEmail={user?.email}
        avatarUrl={user?.avatarUrl ?? null}
        avatarColor={user?.avatarColor}
        isDeveloper={isDevAccount(user)}
        dateLabel={dateLabel}
        clock={clock}
        status={status}
        workedH={workedH}
        workedM={workedM}
        checkIn={att?.checkIn ?? null}
        checkOut={att?.checkOut ?? null}
        dayProgress={dayProgress}
        onCheckIn={checkIn}
        onCheckOut={checkOut}
      />

      {/* ========= 빠른 액션 ========= */}
      <QuickActions />

      {/* ========= 본문 2열 ========= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <ScheduleCard events={events} />
          <NoticeCard notices={notices} />
        </div>
        <div className="space-y-5">
          <ProfileSummary
            name={user?.name ?? ""}
            email={user?.email}
            team={user?.team ?? null}
            position={user?.position ?? null}
            role={user?.role ?? ""}
            avatarUrl={user?.avatarUrl ?? null}
            avatarColor={user?.avatarColor}
            isDeveloper={isDevAccount(user)}
          />
          <TodayMiniStats checkIn={att?.checkIn ?? null} checkOut={att?.checkOut ?? null} workedH={workedH} workedM={workedM} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 *  HERO — 그라데이션 + 시계 + 출퇴근 진행률
 * ============================================================ */
type WorkStatus = "IN" | "OFF" | "NONE";
type HeroProps = {
  greeting: { greet: string; emoji: string };
  userName: string;
  userEmail?: string;
  avatarUrl: string | null;
  avatarColor?: string;
  isDeveloper: boolean;
  dateLabel: string;
  clock: string;
  status: WorkStatus;
  workedH: number;
  workedM: number;
  checkIn: string | null;
  checkOut: string | null;
  dayProgress: number;
  onCheckIn: () => void;
  onCheckOut: () => void;
};

function Hero(p: HeroProps) {
  const statusColor = p.status === "IN" ? "#22C55E" : p.status === "OFF" ? "#94A3B8" : "#F59E0B";
  const statusLabel = p.status === "IN" ? "근무 중" : p.status === "OFF" ? "퇴근 완료" : "출근 전";

  return (
    <section
      className="rounded-2xl overflow-hidden relative"
      style={{
        background: "linear-gradient(135deg, var(--c-brand) 0%, #7C3AED 60%, #DB2777 100%)",
        color: "#fff",
        boxShadow: "0 18px 40px rgba(67, 56, 202, 0.18)",
      }}
    >
      {/* 격자 패턴 + 광원 */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse at top right, #000 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute", top: -80, right: -60, width: 280, height: 280, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="relative px-6 sm:px-10 py-7 sm:py-10">
        {/* 윗줄 — 인사 + 시계 */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="text-[12.5px] font-bold opacity-80 mb-1.5">{p.dateLabel}</div>
            <h1 className="text-[26px] sm:text-[32px] font-extrabold tracking-tight leading-tight">
              {p.greeting.emoji} {p.greeting.greet},{" "}
              <span style={{ background: "linear-gradient(180deg,#fff 50%,rgba(255,255,255,0.7))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                {p.userName}
              </span>{" "}
              님
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {p.isDeveloper && <DevBadge size="sm" />}
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-bold"
                style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.24)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: statusColor }} />
                {statusLabel}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[44px] sm:text-[56px] font-extrabold tabular-nums leading-none" style={{ letterSpacing: "-0.04em" }}>
              {p.clock}
            </div>
            <div className="text-[11px] opacity-75 font-mono mt-1">KST · live</div>
          </div>
        </div>

        {/* 출퇴근 카드 */}
        <div
          className="mt-6 rounded-xl p-4 sm:p-5"
          style={{ background: "rgba(0,0,0,0.18)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.12)" }}
        >
          {/* 진행 막대 — 9~18시 기준, 출/퇴근 마커 */}
          <div className="flex items-center justify-between mb-2 text-[11px] opacity-80 font-mono">
            <span>09:00</span>
            <span>{p.workedH}시간 {String(p.workedM).padStart(2, "0")}분 근무</span>
            <span>18:00</span>
          </div>
          <div className="relative h-2 rounded-full" style={{ background: "rgba(255,255,255,0.18)" }}>
            <div
              className="absolute top-0 left-0 h-full rounded-full"
              style={{ width: `${p.dayProgress * 100}%`, background: "linear-gradient(90deg, #FCD34D, #F472B6, #fff)", boxShadow: "0 0 12px rgba(255,255,255,0.5)" }}
            />
            {/* 현재 시각 마커 */}
            <div
              className="absolute -top-1.5 w-3 h-5 rounded-sm"
              style={{ left: `calc(${p.dayProgress * 100}% - 6px)`, background: "#fff", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}
            />
          </div>

          <div className="flex items-end justify-between mt-4 gap-3 flex-wrap">
            <div className="flex gap-5 sm:gap-7">
              <TimeStamp label="출근" iso={p.checkIn} />
              <TimeStamp label="퇴근" iso={p.checkOut} />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={p.onCheckIn}
                disabled={!!p.checkIn && !p.checkOut}
                className="px-4 py-2 rounded-lg text-[12.5px] font-extrabold transition disabled:opacity-50"
                style={{ background: "#fff", color: "#5B21B6" }}
              >
                {p.checkOut ? "다시 출근" : p.checkIn ? "출근 완료" : "출근하기"}
              </button>
              <button
                type="button"
                onClick={p.onCheckOut}
                disabled={!p.checkIn || !!p.checkOut}
                className="px-4 py-2 rounded-lg text-[12.5px] font-extrabold transition disabled:opacity-50"
                style={{ background: "rgba(255,255,255,0.16)", color: "#fff", border: "1px solid rgba(255,255,255,0.32)" }}
              >
                {p.checkOut ? "퇴근 완료" : "퇴근하기"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TimeStamp({ label, iso }: { label: string; iso: string | null }) {
  return (
    <div>
      <div className="text-[10.5px] opacity-70 uppercase tracking-[0.06em] font-bold">{label}</div>
      <div className="text-[20px] font-extrabold tabular-nums" style={{ letterSpacing: "-0.02em" }}>
        {iso ? new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
      </div>
    </div>
  );
}

/* ============================================================
 *  Quick Actions — 자주 쓰는 행동을 한 줄로
 * ============================================================ */
function QuickActions() {
  const items: { to: string; label: string; emoji: string; tint: string }[] = [
    { to: "/schedule",   label: "새 일정",  emoji: "📅", tint: "#3B5CF0" },
    { to: "/journal",    label: "업무일지", emoji: "📝", tint: "#16A34A" },
    { to: "/meetings",   label: "회의록",   emoji: "📋", tint: "#7C3AED" },
    { to: "/approvals",  label: "결재",     emoji: "✅", tint: "#F59E0B" },
    { to: "/expense",    label: "지출",     emoji: "💳", tint: "#DB2777" },
    { to: "/notice",     label: "공지",     emoji: "📣", tint: "#0EA5E9" },
  ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to}
          className="panel p-3.5 hover:!border-brand-300 transition group flex flex-col items-center justify-center gap-1.5"
          style={{ minHeight: 80 }}
        >
          <div
            className="w-9 h-9 rounded-xl grid place-items-center text-[18px] transition group-hover:scale-110"
            style={{ background: it.tint + "1A", color: it.tint }}
          >
            {it.emoji}
          </div>
          <div className="text-[12px] font-bold text-ink-900">{it.label}</div>
        </Link>
      ))}
    </div>
  );
}

/* ============================================================
 *  ScheduleCard / NoticeCard / ProfileSummary / TodayMiniStats
 * ============================================================ */
function ScheduleCard({ events }: { events: Event[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const k = new Date(e.startAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return Array.from(map.entries());
  }, [events]);

  return (
    <div className="panel p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.06em] uppercase text-ink-500">일정</div>
          <div className="text-[16px] font-extrabold text-ink-900 mt-0.5">이번 주 {events.length}건</div>
        </div>
        <Link to="/schedule" className="btn-ghost btn-xs">전체 보기</Link>
      </div>
      {events.length === 0 ? (
        <div className="px-5 pb-10 pt-2 text-center">
          <div className="text-[34px] mb-2">🗓️</div>
          <div className="text-[12.5px] text-ink-500">이번 주 등록된 일정이 없어요.</div>
        </div>
      ) : (
        <div className="px-5 pb-4">
          {grouped.map(([day, items]) => (
            <div key={day} className="mt-3 first:mt-0">
              <div className="text-[10.5px] font-extrabold tracking-[0.06em] uppercase text-ink-500 mb-1.5">{day}</div>
              <div className="space-y-1.5">
                {items.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: "var(--c-surface-3)" }}>
                    <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: e.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-ink-900 truncate">{e.title}</div>
                      <div className="text-[10.5px] text-ink-500 mt-0.5 tabular-nums">
                        {new Date(e.startAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}
                        {" → "}
                        {new Date(e.endAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}
                      </div>
                    </div>
                    <ScopeBadge scope={e.scope} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NoticeCard({ notices }: { notices: Notice[] }) {
  return (
    <div className="panel p-0 overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div>
          <div className="text-[10.5px] font-extrabold tracking-[0.06em] uppercase text-ink-500">공지</div>
          <div className="text-[16px] font-extrabold text-ink-900 mt-0.5">최근 {notices.length}건</div>
        </div>
        <Link to="/notice" className="btn-ghost btn-xs">전체 보기</Link>
      </div>
      {notices.length === 0 ? (
        <div className="px-5 pb-10 pt-2 text-center">
          <div className="text-[34px] mb-2">📭</div>
          <div className="text-[12.5px] text-ink-500">아직 공지가 없어요.</div>
        </div>
      ) : (
        <div className="divide-y divide-ink-100">
          {notices.map((n) => (
            <Link
              key={n.id}
              to={`/notice?id=${n.id}`}
              className="block px-5 py-3.5 hover:bg-ink-25 transition"
            >
              <div className="flex items-center gap-2 mb-1">
                {n.pinned && (
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold"
                    style={{ background: "rgba(220,38,38,0.12)", color: "var(--c-danger)" }}
                  >
                    PIN
                  </span>
                )}
                <div className="text-[13.5px] font-extrabold text-ink-900 truncate">{n.title}</div>
              </div>
              <div className="text-[11px] text-ink-500 flex items-center gap-1.5 flex-wrap">
                <span>{n.author?.name}</span>
                {isDevAccount(n.author) && <DevBadge size="sm" />}
                <span className="text-ink-300">·</span>
                <span className="tabular-nums">{relTime(n.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileSummary(p: { name: string; email?: string; team: string | null; position: string | null; role: string; avatarUrl: string | null; avatarColor?: string; isDeveloper: boolean }) {
  const initial = (p.name?.[0] ?? "?").toUpperCase();
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-2xl grid place-items-center text-white text-[18px] font-extrabold overflow-hidden flex-shrink-0"
          style={{ background: p.avatarUrl ? "transparent" : (p.avatarColor ?? "#3D54C4") }}
        >
          {p.avatarUrl ? <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" /> : initial}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[15px] font-extrabold text-ink-900 truncate">{p.name}</span>
            {p.isDeveloper && <DevBadge size="sm" />}
          </div>
          <div className="text-[12px] text-ink-500 truncate">{p.email}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-ink-100">
        <Field label="직급" value={p.position ?? "—"} />
        <Field label="팀" value={p.team ?? "—"} />
        <Field label="권한" value={p.role} mono />
        <div>
          <div className="text-[10.5px] font-bold text-ink-500 uppercase tracking-[0.06em]">상태</div>
          <div className="mt-1">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ background: "rgba(22,163,74,0.12)", color: "var(--c-success)" }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--c-success)" }} />
              Active
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10.5px] font-bold text-ink-500 uppercase tracking-[0.06em]">{label}</div>
      <div className={`text-[13px] font-bold text-ink-900 mt-1 ${mono ? "font-mono tracking-tight" : ""}`}>{value}</div>
    </div>
  );
}

function TodayMiniStats({ checkIn, checkOut, workedH, workedM }: { checkIn: string | null; checkOut: string | null; workedH: number; workedM: number }) {
  return (
    <div className="panel p-5">
      <div className="text-[10.5px] font-extrabold tracking-[0.06em] uppercase text-ink-500 mb-3">오늘 근태</div>
      <div className="grid grid-cols-3 gap-3">
        <MiniStat label="출근" value={timeOf(checkIn)} accent="#22C55E" />
        <MiniStat label="퇴근" value={timeOf(checkOut)} accent="#94A3B8" />
        <MiniStat label="누적" value={checkIn ? `${workedH}:${String(workedM).padStart(2, "0")}` : "—"} accent="#7C3AED" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-lg p-2.5" style={{ background: "var(--c-surface-3)" }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.06em]" style={{ color: accent }}>{label}</div>
      <div className="text-[15px] font-extrabold text-ink-900 mt-1 tabular-nums" style={{ letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: string }) {
  if (scope === "COMPANY") return <span className="chip-brand">전사</span>;
  if (scope === "TEAM") return <span className="chip-blue">팀</span>;
  return <span className="chip-gray">개인</span>;
}

/* ===== utils ===== */
function timeOf(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function greetingFor(d: Date): { greet: string; emoji: string } {
  const h = d.getHours();
  if (h < 6) return { greet: "늦은 밤이에요", emoji: "🌙" };
  if (h < 11) return { greet: "좋은 아침이에요", emoji: "☀️" };
  if (h < 14) return { greet: "점심 시간이네요", emoji: "🍱" };
  if (h < 18) return { greet: "오후도 화이팅", emoji: "✨" };
  if (h < 22) return { greet: "수고하셨어요", emoji: "🌆" };
  return { greet: "좋은 밤 되세요", emoji: "🌙" };
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "방금";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}분 전`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}시간 전`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}
