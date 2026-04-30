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
 * 개요 — Linear/Stripe 풍 정보 밀도 우선.
 * 큰 시각 강조 X. 라벨/숫자 위계만으로 구분.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [att, setAtt] = useState<Attendance>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
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
    setNotices(n.notices.slice(0, 6));
    setEvents(s.events.slice(0, 8));
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

  const dateLabel = now.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  const status: WorkStatus = att?.checkOut ? "OFF" : att?.checkIn ? "IN" : "NONE";
  const workedMin = att?.checkIn
    ? Math.max(0, Math.floor(((att.checkOut ? new Date(att.checkOut).getTime() : now.getTime()) - new Date(att.checkIn).getTime()) / 60000))
    : 0;

  // 일정/공지를 일자별로 그룹.
  const eventsByDay = useMemo(() => groupByDay(events), [events]);

  return (
    <div className="max-w-[1100px]">
      {/* 헤더 — PageHeader 안 쓰고 페이지마다 톤 다르게. */}
      <header className="mb-6">
        <div className="text-[11.5px] font-bold text-ink-500 tabular-nums">{dateLabel}</div>
        <h1 className="text-[22px] font-extrabold text-ink-900 mt-0.5 flex items-center gap-2 flex-wrap">
          <span>{user?.name ?? ""}</span>
          {isDevAccount(user) && <DevBadge size="sm" />}
        </h1>
      </header>

      <InstallAppBanner />

      {/* 오늘 한 줄 요약 — 표 같은 행. */}
      <section
        className="rounded-xl mb-6 px-5 py-4 flex items-center gap-6 flex-wrap"
        style={{ background: "var(--c-surface-2)", border: "1px solid var(--c-border)" }}
      >
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor(status) }} />
          <span className="text-[12.5px] font-bold text-ink-900">{labelOf(status)}</span>
        </div>
        <KV label="출근" value={timeOf(att?.checkIn ?? null)} />
        <KV label="퇴근" value={timeOf(att?.checkOut ?? null)} />
        <KV label="누적" value={att?.checkIn ? formatDuration(workedMin) : "—"} />
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={checkIn}
            disabled={!!att?.checkIn && !att?.checkOut}
            className="btn-primary btn-xs"
          >
            {att?.checkOut ? "다시 출근" : att?.checkIn ? "출근됨" : "출근"}
          </button>
          <button
            type="button"
            onClick={checkOut}
            disabled={!att?.checkIn || !!att?.checkOut}
            className="btn-ghost btn-xs"
          >
            퇴근
          </button>
        </div>
      </section>

      {/* 본문 — 12열 그리드, 좌 8 / 우 4. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-8">
        {/* 좌측 */}
        <div className="lg:col-span-8 space-y-8">
          <Section title="이번 주 일정" count={events.length} href="/schedule">
            {events.length === 0 ? (
              <Empty>등록된 일정 없음</Empty>
            ) : (
              <div className="space-y-4">
                {eventsByDay.map(([day, items]) => (
                  <div key={day}>
                    <DayHeader label={day} />
                    <ul className="divide-y divide-ink-100">
                      {items.map((e) => (
                        <li key={e.id} className="flex items-center gap-3 py-2.5">
                          <span className="w-[3px] h-5 rounded-full flex-shrink-0" style={{ background: e.color }} />
                          <span className="text-[10.5px] font-mono text-ink-500 tabular-nums w-[88px] flex-shrink-0">
                            {timeRange(e.startAt, e.endAt)}
                          </span>
                          <span className="flex-1 min-w-0 text-[13px] font-bold text-ink-900 truncate">{e.title}</span>
                          <ScopeChip scope={e.scope} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="공지" count={notices.length} href="/notice">
            {notices.length === 0 ? (
              <Empty>아직 공지가 없어요.</Empty>
            ) : (
              <ul className="divide-y divide-ink-100">
                {notices.map((n) => (
                  <li key={n.id}>
                    <Link to={`/notice?id=${n.id}`} className="flex items-baseline gap-3 py-2.5 hover:opacity-80 transition">
                      <span className="text-[10.5px] font-mono text-ink-500 tabular-nums w-[68px] flex-shrink-0 pt-0.5">
                        {shortDate(n.createdAt)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {n.pinned && <PinChip />}
                          <span className="text-[13px] font-bold text-ink-900 truncate">{n.title}</span>
                        </div>
                        <div className="text-[10.5px] text-ink-500 mt-0.5 flex items-center gap-1 flex-wrap">
                          <span>{n.author?.name}</span>
                          {isDevAccount(n.author) && <DevBadge size="sm" />}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* 우측 */}
        <aside className="lg:col-span-4 space-y-8">
          <Section title="바로가기">
            <ul className="divide-y divide-ink-100">
              <NavLink to="/schedule" label="일정" hint="이번 주 / 캘린더" />
              <NavLink to="/journal" label="업무 일지" hint="오늘 작성 / 기록" />
              <NavLink to="/meetings" label="회의록" hint="작성 · 공유" />
              <NavLink to="/approvals" label="결재" hint="신청 · 검토" />
              <NavLink to="/expense" label="지출" hint="법인카드 / 사용 내역" />
              <NavLink to="/directory" label="팀원" hint="검색 · 1:1 대화" />
            </ul>
          </Section>

          <Section title="내 정보">
            <dl className="divide-y divide-ink-100">
              <Row label="이메일" value={user?.email ?? "—"} mono />
              <Row label="직급" value={user?.position ?? "—"} />
              <Row label="팀" value={user?.team ?? "—"} />
              <Row label="권한" value={user?.role ?? "—"} mono />
              <Row label="사번" value={(user?.employeeNo as any) ?? "—"} mono />
            </dl>
          </Section>
        </aside>
      </div>
    </div>
  );
}

/* ============================================================
 *  building blocks
 * ============================================================ */
type WorkStatus = "IN" | "OFF" | "NONE";

function Section({ title, count, href, children }: { title: string; count?: number; href?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between border-b border-ink-150 pb-1.5 mb-3">
        <h2 className="text-[13px] font-extrabold text-ink-900">
          {title}
          {typeof count === "number" && <span className="ml-1.5 text-[11px] font-bold text-ink-400 tabular-nums">{count}</span>}
        </h2>
        {href && <Link to={href} className="text-[11px] text-ink-500 hover:text-ink-800">전체 →</Link>}
      </div>
      {children}
    </section>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-ink-500">{label}</div>
      <div className="text-[14px] font-extrabold text-ink-900 tabular-nums" style={{ letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

function DayHeader({ label }: { label: string }) {
  return (
    <div className="text-[10.5px] font-extrabold tracking-[0.06em] uppercase text-ink-500 mb-0.5 mt-2 first:mt-0">
      {label}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-8 text-center text-[12px] text-ink-500">{children}</div>;
}

function NavLink({ to, label, hint }: { to: string; label: string; hint: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center justify-between py-2.5 hover:opacity-70 transition">
        <span className="text-[13px] font-bold text-ink-900">{label}</span>
        <span className="text-[10.5px] text-ink-500">{hint} <span className="ml-1 text-ink-300">→</span></span>
      </Link>
    </li>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <dt className="text-[11.5px] font-bold text-ink-500">{label}</dt>
      <dd className={`text-[12.5px] font-bold text-ink-900 truncate text-right ${mono ? "font-mono tracking-tight" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function PinChip() {
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[9.5px] font-extrabold flex-shrink-0" style={{ background: "rgba(220,38,38,0.10)", color: "var(--c-danger)" }}>
      PIN
    </span>
  );
}

function ScopeChip({ scope }: { scope: string }) {
  const label = scope === "COMPANY" ? "전사" : scope === "TEAM" ? "팀" : "개인";
  return (
    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-ink-500 flex-shrink-0" style={{ background: "var(--c-surface-3)" }}>
      {label}
    </span>
  );
}

/* ===== utils ===== */
function dotColor(s: WorkStatus) {
  return s === "IN" ? "var(--c-success)" : s === "OFF" ? "var(--c-text-3)" : "#F59E0B";
}
function labelOf(s: WorkStatus) {
  return s === "IN" ? "근무 중" : s === "OFF" ? "퇴근 완료" : "출근 전";
}
function timeOf(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function timeRange(a: string, b: string): string {
  return `${timeOf(a)}–${timeOf(b)}`;
}
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}
function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
function groupByDay(events: Event[]): [string, Event[]][] {
  const map = new Map<string, Event[]>();
  for (const e of events) {
    const k = new Date(e.startAt).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return Array.from(map.entries());
}
