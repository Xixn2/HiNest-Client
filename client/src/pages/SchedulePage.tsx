import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";
import { getHoliday } from "../lib/holidays";
import DateTimePicker from "../components/DateTimePicker";

export type Category =
  | "MEETING" | "DEADLINE" | "OUT" | "HOLIDAY" | "EVENT"
  | "BIRTHDAY" | "TASK" | "INTERVIEW" | "TRAINING" | "CLIENT"
  | "SOCIAL" | "HEALTH" | "PERSONAL_C"
  | "COMPANY_HOLIDAY" | "COMPANY_LEAVE"
  | "OTHER";

export type EventScope = "COMPANY" | "TEAM" | "PERSONAL" | "TARGETED";

type Event = {
  id: string;
  title: string;
  content?: string;
  scope: EventScope;
  team?: string | null;
  category?: Category;
  targetUserIds?: string | null;
  startAt: string;
  endAt: string;
  color: string;
  author: { name: string };
  createdBy: string;
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
}

export default function SchedulePage() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState(() => new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "",
    content: "",
    scope: "COMPANY" as EventScope,
    category: "MEETING" as Category,
    targetUserIds: [] as string[],
    startAt: "",
    endAt: "",
    color: "#3B5CF0",
  });
  const [dayOpen, setDayOpen] = useState<Date | null>(null);

  async function load() {
    const from = startOfMonth(cursor).toISOString();
    const to = endOfMonth(cursor).toISOString();
    const res = await api<{ events: Event[] }>(
      `/api/schedule?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    setEvents(res.events);
  }

  useEffect(() => {
    load();
  }, [cursor]);

  const days = useMemo(() => {
    const first = startOfMonth(cursor);
    const startDay = first.getDay();
    const total = endOfMonth(cursor).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= total; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  function eventsOn(d: Date) {
    return events.filter((e) => {
      const s = new Date(e.startAt);
      const en = new Date(e.endAt);
      return d >= new Date(s.getFullYear(), s.getMonth(), s.getDate()) &&
        d <= new Date(en.getFullYear(), en.getMonth(), en.getDate());
    });
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.startAt || !form.endAt) return alert("시작/종료 시각을 선택해주세요");
    if (form.scope === "TARGETED" && form.targetUserIds.length === 0)
      return alert("대상 인원을 1명 이상 선택해주세요");
    await api("/api/schedule", {
      method: "POST",
      json: {
        ...form,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      },
    });
    setOpen(false);
    setForm({
      title: "",
      content: "",
      scope: "COMPANY",
      category: "MEETING",
      targetUserIds: [],
      startAt: "",
      endAt: "",
      color: "#3B5CF0",
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    await api(`/api/schedule/${id}`, { method: "DELETE" });
    load();
  }

  const canMakeCompany = user?.role === "ADMIN" || user?.role === "MANAGER";

  return (
    <div>
      <PageHeader
        title="일정관리"
        description="전사/팀/개인 일정을 월별로 관리합니다."
        right={
          <div className="flex items-center gap-2 flex-wrap">
            <button className="btn-ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              ←
            </button>
            <div className="font-bold text-ink-900 w-28 sm:w-32 text-center">
              {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
            </div>
            <button className="btn-ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              →
            </button>
            <button className="btn-primary sm:ml-3" onClick={() => setOpen(true)}>
              + 일정 추가
            </button>
          </div>
        }
      />

      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
        <div className="min-w-[640px]">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div key={d} className={`px-3 py-2 text-xs font-bold text-center ${i === 0 ? "text-rose-500" : i === 6 ? "text-accent-500" : "text-ink-500"}`}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const todays = d ? eventsOn(d) : [];
            const isToday =
              d &&
              new Date().toDateString() === d.toDateString();
            const holiday = d ? getHoliday(d) : undefined;
            const isSunday = d && d.getDay() === 0;
            const isSaturday = d && d.getDay() === 6;
            const isRed = holiday || isSunday;

            // 날짜 숫자 색상
            let numClass = "text-ink-700";
            if (isRed) numClass = "text-rose-500";
            else if (isSaturday) numClass = "text-accent-500";

            return (
              <div
                key={i}
                className={`min-h-[110px] border-b border-r border-ink-100 p-2 ${
                  holiday ? "bg-rose-50/40" : ""
                }`}
              >
                {d && (
                  <>
                    <div className="flex items-center justify-between mb-1 gap-1">
                      <div
                        className={`text-xs font-bold tabular ${
                          isToday
                            ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-500 text-white"
                            : numClass
                        }`}
                      >
                        {d.getDate()}
                      </div>
                      {holiday && (
                        <div
                          className="text-[10px] font-bold text-rose-600 truncate"
                          title={holiday.name + (holiday.substitute ? " (대체공휴일)" : "")}
                        >
                          {holiday.name.replace(" 대체공휴일", "*")}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      {todays.slice(0, 3).map((e) => (
                        <EventChip key={e.id} e={e} onRemove={() => remove(e.id)} />
                      ))}
                      {todays.length > 3 && (
                        <button
                          type="button"
                          className="text-[11px] font-bold text-ink-500 hover:text-ink-800 px-1.5"
                          onClick={() => setDayOpen(d!)}
                        >
                          +{todays.length - 3}건 더보기
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        </div>
        </div>
      </div>

      {open && (
        <EventModal
          onClose={() => setOpen(false)}
          form={form}
          setForm={setForm}
          onSubmit={create}
          canMakeCompany={canMakeCompany}
        />
      )}

      {dayOpen && (
        <DayDetailModal
          date={dayOpen}
          events={eventsOn(dayOpen)}
          onClose={() => setDayOpen(null)}
          onRemove={(id) => {
            if (!confirm("삭제하시겠습니까?")) return;
            api(`/api/schedule/${id}`, { method: "DELETE" }).then(() => load());
          }}
        />
      )}
    </div>
  );
}

/* ============================================================ */
/*                       Event Chip                             */
/* ============================================================ */
function EventChip({ e, onRemove }: { e: Event; onRemove: () => void }) {
  const cat = e.category ? CATEGORIES.find((c) => c.key === e.category) : undefined;
  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  // 다중일 이벤트면 시간 생략, 단일일이면 HH:mm 표시
  const multi =
    start.toDateString() !== end.toDateString();
  const timeStr = multi
    ? ""
    : start.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <button
      type="button"
      onClick={onRemove}
      className="group/ev block w-full text-left rounded-md overflow-hidden"
      title={`${e.title} (클릭시 삭제)`}
    >
      <div
        className="flex items-center gap-1 px-1.5 py-1 border"
        style={{
          background: e.color + "14",
          borderColor: e.color + "33",
          color: e.color,
        }}
      >
        <span className="flex-shrink-0" aria-hidden>
          {cat?.icon ?? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="6" />
            </svg>
          )}
        </span>
        <span className="text-[11px] font-bold truncate flex-1" style={{ color: e.color }}>
          {e.title}
        </span>
        {timeStr && (
          <span className="text-[10px] tabular opacity-80 flex-shrink-0">{timeStr}</span>
        )}
      </div>
    </button>
  );
}

/* ============================================================ */
/*                     Day Detail Modal                         */
/* ============================================================ */
function DayDetailModal({
  date,
  events,
  onClose,
  onRemove,
}: {
  date: Date;
  events: Event[];
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  const holiday = getHoliday(date);
  return (
    <div className="fixed inset-0 bg-ink-900/40 grid place-items-center p-4 z-50" onClick={onClose}>
      <div
        className="panel w-full max-w-[480px] shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4 flex items-start justify-between">
          <div>
            <div className="text-[11px] font-extrabold text-ink-500 uppercase tracking-[0.08em]">
              {date.toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <div className="h-display">
                {date.getDate()}일
              </div>
              <div className="text-[13px] text-ink-500 font-semibold">
                {date.toLocaleDateString("ko-KR", { weekday: "long" })}
              </div>
            </div>
            {holiday && (
              <div className="text-[12px] font-bold text-rose-600 mt-1">
                {holiday.name}{holiday.substitute ? " (대체공휴일)" : ""}
              </div>
            )}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="닫기">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 pb-5 max-h-[60vh] overflow-auto">
          {events.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-ink-500">일정이 없어요.</div>
          ) : (
            <div className="space-y-2">
              {events.map((e) => {
                const cat = e.category ? CATEGORIES.find((c) => c.key === e.category) : undefined;
                const start = new Date(e.startAt);
                const end = new Date(e.endAt);
                return (
                  <div
                    key={e.id}
                    className="panel p-3 flex items-start gap-3"
                    style={{ borderLeft: `3px solid ${e.color}` }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0"
                      style={{ background: e.color + "1A", color: e.color }}
                    >
                      {cat?.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {cat && (
                          <span
                            className="chip"
                            style={{ background: e.color + "1A", color: e.color }}
                          >
                            {cat.label}
                          </span>
                        )}
                        <span className="chip-gray">
                          {e.scope === "COMPANY" ? "전사" :
                           e.scope === "TEAM" ? "팀" :
                           e.scope === "TARGETED" ? "대상 지정" : "개인"}
                        </span>
                      </div>
                      <div className="text-[14px] font-bold text-ink-900 mt-1">{e.title}</div>
                      <div className="text-[11.5px] text-ink-500 mt-0.5 tabular">
                        {start.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        {" — "}
                        {end.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                      {e.content && (
                        <div className="text-[12px] text-ink-700 mt-2 whitespace-pre-wrap leading-snug">
                          {e.content}
                        </div>
                      )}
                      <div className="text-[11px] text-ink-500 mt-2">
                        작성자 · {e.author.name}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-icon text-danger"
                      onClick={() => onRemove(e.id)}
                      title="삭제"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/*                       Event Modal                            */
/* ============================================================ */

const EVENT_COLORS = [
  "#3B5CF0", // 브랜드 블루
  "#2962FF", // 액센트 블루
  "#0EA5E9", // 하늘
  "#0891B2", // 청록
  "#14B8A6", // 틸
  "#16A34A", // 그린
  "#65A30D", // 라임
  "#CA8A04", // 머스터드
  "#D97706", // 앰버
  "#EA580C", // 오렌지
  "#DC2626", // 레드
  "#DB2777", // 핑크
  "#C026D3", // 마젠타
  "#9333EA", // 바이올렛
  "#7C3AED", // 퍼플
  "#475569", // 슬레이트
];

const SCOPE_META: Record<EventScope, { label: string; desc: string; icon: JSX.Element }> = {
  PERSONAL: {
    label: "개인",
    desc: "나만 볼 수 있어요",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
  TEAM: {
    label: "팀",
    desc: "같은 팀 구성원에게 공유",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2 20a7 7 0 0 1 14 0" />
        <circle cx="17" cy="10" r="3" />
        <path d="M22 20a6 6 0 0 0-8-5.6" />
      </svg>
    ),
  },
  TARGETED: {
    label: "대상 지정",
    desc: "선택한 구성원에게만 공유",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="m17 11 2 2 4-4" />
      </svg>
    ),
  },
  COMPANY: {
    label: "전사",
    desc: "모든 구성원에게 공유",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
      </svg>
    ),
  },
};

const CATEGORIES: { key: Category; label: string; color: string; icon: JSX.Element; adminOnly?: boolean }[] = [
  { key: "MEETING",   label: "회의",      color: "#3B5CF0", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 11a5 5 0 1 0-10 0" /><path d="M3 21v-2a5 5 0 0 1 5-5h8a5 5 0 0 1 5 5v2" /><circle cx="12" cy="6" r="3" /></svg> },
  { key: "DEADLINE",  label: "마감",      color: "#DC2626", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg> },
  { key: "OUT",       label: "외근·출장", color: "#16A34A", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s-8-5.5-8-12a8 8 0 1 1 16 0c0 6.5-8 12-8 12z" /><circle cx="12" cy="10" r="3" /></svg> },
  { key: "HOLIDAY",   label: "휴가",      color: "#D97706", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C9 6 7 10 7 14a5 5 0 0 0 10 0c0-4-2-8-5-12z" /></svg> },
  { key: "EVENT",     label: "사내행사",  color: "#9333EA", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V5a6 6 0 0 1 12 0v4" /><path d="M5 9h14l-1.5 11H6.5z" /><path d="M10 14h4" /></svg> },
  { key: "BIRTHDAY",  label: "기념일",    color: "#DB2777", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7" /><path d="M2 21h20M7 12V8a5 5 0 0 1 10 0v4M12 5V2" /></svg> },
  { key: "TASK",      label: "업무",      color: "#0EA5E9", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13l2 2 4-4" /></svg> },
  { key: "INTERVIEW", label: "면접",      color: "#2962FF", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /><path d="m17 5 1.5-1.5M19 7l1.5-1.5" /></svg> },
  { key: "TRAINING",  label: "교육·워크샵", color: "#14B8A6", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c3 2 9 2 12 0v-5" /></svg> },
  { key: "CLIENT",    label: "고객·미팅", color: "#CA8A04", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" /><path d="M10 7V5h4v2" /></svg> },
  { key: "SOCIAL",    label: "회식·모임", color: "#EA580C", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 22h8M12 15v7" /><path d="M17 3H7l1 9a4 4 0 1 0 8 0z" /></svg> },
  { key: "HEALTH",    label: "건강·병원", color: "#DC2626", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg> },
  { key: "PERSONAL_C",label: "개인일정",  color: "#7C3AED", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg> },
  { key: "COMPANY_HOLIDAY", label: "사내 휴일", color: "#E11D48", adminOnly: true, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m9 14 2 2 4-4" /></svg> },
  { key: "COMPANY_LEAVE",   label: "전사 휴가", color: "#F97316", adminOnly: true, icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="6" /><path d="M2 22c3-3 7-3 10 0 3-3 7-3 10 0" /></svg> },
  { key: "OTHER",     label: "일반",      color: "#475569", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /></svg> },
];

type EventForm = {
  title: string;
  content: string;
  scope: EventScope;
  category: Category;
  targetUserIds: string[];
  startAt: string;
  endAt: string;
  color: string;
};

type DirUser = { id: string; name: string; email: string; team?: string | null; avatarColor?: string; position?: string | null };

function EventModal({
  onClose,
  form,
  setForm,
  onSubmit,
  canMakeCompany,
}: {
  onClose: () => void;
  form: EventForm;
  setForm: (f: EventForm) => void;
  onSubmit: (e: React.FormEvent) => void;
  canMakeCompany: boolean;
}) {
  const scopes: EventScope[] = canMakeCompany
    ? ["COMPANY", "TEAM", "PERSONAL", "TARGETED"]
    : ["TEAM", "PERSONAL", "TARGETED"];

  const [directory, setDirectory] = useState<DirUser[]>([]);
  const [userSearch, setUserSearch] = useState("");
  useEffect(() => {
    if (form.scope !== "TARGETED" || directory.length) return;
    api<{ users: DirUser[] }>("/api/users").then((r) => setDirectory(r.users));
  }, [form.scope, directory.length]);

  function toggleTarget(id: string) {
    setForm({
      ...form,
      targetUserIds: form.targetUserIds.includes(id)
        ? form.targetUserIds.filter((x) => x !== id)
        : [...form.targetUserIds, id],
    });
  }
  function removeTarget(id: string) {
    setForm({ ...form, targetUserIds: form.targetUserIds.filter((x) => x !== id) });
  }

  const filteredDir = directory.filter((d) => {
    const k = userSearch.trim().toLowerCase();
    if (!k) return true;
    return (
      d.name.toLowerCase().includes(k) ||
      (d.team ?? "").toLowerCase().includes(k) ||
      d.email.toLowerCase().includes(k)
    );
  });

  return (
    <div className="fixed inset-0 bg-ink-900/40 grid place-items-center p-4 z-50" onClick={onClose}>
      <div
        className="panel w-full max-w-[640px] shadow-pop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg grid place-items-center"
              style={{ background: form.color + "22", color: form.color }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="16" rx="2.5" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
            </div>
            <div>
              <div className="h-title">일정 추가</div>
              <div className="text-[11.5px] text-ink-500">팀과 공유할 일정을 만들어보세요</div>
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="닫기">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <div className="px-6 pb-5 space-y-5">
            {/* 제목 */}
            <div>
              <label className="field-label">제목</label>
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="무엇을 계획하고 있나요?"
                autoFocus
                required
              />
            </div>

            {/* 시간 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">시작</label>
                <DateTimePicker
                  value={form.startAt}
                  onChange={(v) => setForm({ ...form, startAt: v })}
                />
              </div>
              <div>
                <label className="field-label">종료</label>
                <DateTimePicker
                  value={form.endAt}
                  onChange={(v) => setForm({ ...form, endAt: v })}
                  min={form.startAt}
                />
              </div>
            </div>

            {/* 카테고리 */}
            <div>
              <label className="field-label">카테고리</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.filter((c) => !c.adminOnly || canMakeCompany).map((c) => {
                  const active = form.category === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setForm({ ...form, category: c.key, color: c.color })}
                      className={`inline-flex items-center gap-1.5 h-[32px] px-3 rounded-full border transition text-[12.5px] font-bold`}
                      style={{
                        borderColor: active ? c.color : "var(--c-border-strong)",
                        background: active ? c.color + "1A" : "var(--c-surface)",
                        color: active ? c.color : "var(--c-text-2)",
                      }}
                    >
                      <span className="inline-flex">{c.icon}</span>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 범위 */}
            <div>
              <label className="field-label">공유 범위</label>
              <div className={`grid gap-2 ${canMakeCompany ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}>
                {scopes.map((s) => {
                  const meta = SCOPE_META[s];
                  const active = form.scope === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, scope: s })}
                      className={`text-left p-3 rounded-xl border-2 transition ${
                        active
                          ? "border-brand-500 bg-brand-50"
                          : "border-ink-150 hover:border-ink-300 bg-white"
                      }`}
                    >
                      <div
                        className={`flex items-center gap-1.5 ${
                          active ? "text-brand-600" : "text-ink-700"
                        }`}
                      >
                        {meta.icon}
                        <span className="text-[13px] font-bold">{meta.label}</span>
                      </div>
                      <div className="text-[11px] text-ink-500 mt-1 leading-snug">
                        {meta.desc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 대상 인원 (TARGETED 일 때) */}
            {form.scope === "TARGETED" && (
              <div>
                <label className="field-label">
                  대상 인원 <span className="text-ink-500 font-normal">({form.targetUserIds.length}명)</span>
                </label>

                {/* 선택된 칩 */}
                {form.targetUserIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {form.targetUserIds.map((id) => {
                      const u = directory.find((x) => x.id === id);
                      if (!u) return null;
                      return (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 pl-1 pr-1 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700"
                        >
                          <span
                            className="w-5 h-5 rounded-full grid place-items-center text-white text-[10px] font-bold"
                            style={{ background: u.avatarColor ?? "#3B5CF0" }}
                          >
                            {u.name[0]}
                          </span>
                          <span className="text-[12px] font-bold">{u.name}</span>
                          <button
                            type="button"
                            onClick={() => removeTarget(id)}
                            className="w-4 h-4 rounded-full hover:bg-brand-100 grid place-items-center"
                            aria-label="제거"
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* 검색 + 리스트 */}
                <div className="panel p-0 overflow-hidden">
                  <div className="px-3 py-2 border-b border-ink-150">
                    <input
                      className="input text-[12px] h-[34px]"
                      placeholder="이름·팀·이메일 검색"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-[200px] overflow-auto divide-y divide-ink-100">
                    {filteredDir.map((u) => {
                      const checked = form.targetUserIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleTarget(u.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-left ${
                            checked ? "bg-brand-50" : "hover:bg-ink-25"
                          }`}
                        >
                          <span className="w-5 h-5 rounded border border-ink-300 grid place-items-center flex-shrink-0" style={{ background: checked ? "var(--c-brand)" : "transparent", borderColor: checked ? "var(--c-brand)" : undefined }}>
                            {checked && (
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 12 5 5L20 7" />
                              </svg>
                            )}
                          </span>
                          <div
                            className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px] font-bold flex-shrink-0"
                            style={{ background: u.avatarColor ?? "#3B5CF0" }}
                          >
                            {u.name[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-bold text-ink-900 truncate">{u.name}</div>
                            <div className="text-[11px] text-ink-500 truncate">
                              {u.position ?? "—"}{u.team ? ` · ${u.team}` : ""}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                    {filteredDir.length === 0 && (
                      <div className="px-4 py-8 text-center text-[12px] text-ink-500">일치하는 팀원이 없어요.</div>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-ink-500 mt-1.5">선택한 팀원에게만 일정이 공유되고 알림이 전송돼요.</div>
              </div>
            )}

            {/* 색상 */}
            <div>
              <label className="field-label">색상</label>
              <div className="flex items-center flex-wrap gap-2">
                {EVENT_COLORS.map((c) => {
                  const active = form.color === c;
                  return (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setForm({ ...form, color: c })}
                      aria-label={c}
                      className={`relative w-7 h-7 rounded-full transition ${
                        active ? "scale-110 ring-2 ring-offset-2 ring-ink-800" : "hover:scale-105"
                      }`}
                      style={{ background: c }}
                    >
                      {active && (
                        <svg
                          className="absolute inset-0 m-auto"
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#fff"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m5 12 5 5L20 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 메모 */}
            <div>
              <label className="field-label">메모 <span className="text-ink-400 font-normal">(선택)</span></label>
              <textarea
                className="input"
                rows={4}
                placeholder="참석자·장소·준비물 등 상세 내용을 적어주세요"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>
          </div>

          {/* 푸터 */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-ink-150 bg-ink-25">
            <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
            <button className="btn-primary">일정 추가</button>
          </div>
        </form>
      </div>
    </div>
  );
}
