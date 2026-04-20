import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

type ProjectEvent = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  color: string;
  assigneeIds: string | null;
  createdById: string;
};

export type CalMember = {
  id: string;
  name: string;
  avatarColor: string;
  position?: string | null;
  team?: string | null;
};

function parseAssignees(s: string | null | undefined): string[] {
  if (!s) return [];
  return s.split(",").filter(Boolean);
}

type View = "month" | "week" | "day";
type Mode = "calendar" | "list";

/* ------------ 날짜 유틸 ------------ */
function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfWeek(d: Date) {
  const c = new Date(d);
  c.setDate(c.getDate() - c.getDay());
  c.setHours(0, 0, 0, 0);
  return c;
}
function endOfWeek(d: Date) {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function fmtHHmm(d: Date) {
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
/** <input type="datetime-local"> 용 문자열 — 로컬 타임존 기반 YYYY-MM-DDTHH:mm */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ------------ 메인 컴포넌트 ------------ */
export default function ProjectCalendar({
  projectId,
  members,
}: {
  projectId: string;
  members: CalMember[];
}) {
  const { user } = useAuth();
  // 담당자 id → 멤버 정보 맵 (아바타 렌더링용)
  const memberMap = useMemo(() => {
    const m = new Map<string, CalMember>();
    for (const x of members) m.set(x.id, x);
    return m;
  }, [members]);
  const [mode, setMode] = useState<Mode>("calendar");
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  /** 담당자 필터 — "all" | "mine" | userId.  */
  const [filter, setFilter] = useState<string>("all");
  const [openCreate, setOpenCreate] = useState(false);
  const [selected, setSelected] = useState<ProjectEvent | null>(null);
  const [form, setForm] = useState(() => initForm());

  function initForm(base?: Date) {
    const now = base ?? new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return {
      title: "",
      description: "",
      startAt: toLocalInput(start),
      endAt: toLocalInput(end),
      allDay: false,
      color: "#3B5CF0",
      assigneeIds: [] as string[],
    };
  }

  function toggleAssignee(uid: string) {
    setForm((f) =>
      f.assigneeIds.includes(uid)
        ? { ...f, assigneeIds: f.assigneeIds.filter((x) => x !== uid) }
        : { ...f, assigneeIds: [...f.assigneeIds, uid] }
    );
  }

  const range = useMemo(() => {
    // 리스트 모드는 항상 해당 달 범위로 로드 — 달력과 쓰는 데이터 범위를 일치시켜 캐시 친화적으로.
    if (mode === "list") return { from: startOfMonth(cursor), to: endOfMonth(cursor) };
    if (view === "month") return { from: startOfMonth(cursor), to: endOfMonth(cursor) };
    if (view === "week") return { from: startOfWeek(cursor), to: endOfWeek(cursor) };
    return { from: startOfDay(cursor), to: endOfDay(cursor) };
  }, [mode, view, cursor]);

  async function load() {
    const q = `from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`;
    const res = await api<{ events: ProjectEvent[] }>(`/api/project/${projectId}/events?${q}`);
    setEvents(res.events);
  }

  /** 필터 적용된 이벤트. "내 일정"은 내가 담당자로 포함된 것 + 내가 만든 것(담당자 없어도 내 스케줄로 취급). */
  const visibleEvents = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "mine") {
      const me = user?.id;
      if (!me) return [];
      return events.filter((ev) => {
        const asg = parseAssignees(ev.assigneeIds);
        return asg.includes(me) || (asg.length === 0 && ev.createdById === me);
      });
    }
    return events.filter((ev) => parseAssignees(ev.assigneeIds).includes(filter));
  }, [events, filter, user?.id]);
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [projectId, mode, view, cursor]);

  function shift(dir: -1 | 1) {
    const c = new Date(cursor);
    if (mode === "list" || view === "month") c.setMonth(c.getMonth() + dir);
    else if (view === "week") c.setDate(c.getDate() + 7 * dir);
    else c.setDate(c.getDate() + dir);
    setCursor(c);
  }

  function eventsOnDay(d: Date) {
    const s = startOfDay(d);
    const e = endOfDay(d);
    return visibleEvents.filter((ev) => {
      const es = new Date(ev.startAt);
      const ee = new Date(ev.endAt);
      return es <= e && ee >= s;
    });
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    await api(`/api/project/${projectId}/events`, {
      method: "POST",
      json: {
        title: form.title,
        description: form.description || null,
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
        allDay: form.allDay,
        color: form.color,
        assigneeIds: form.assigneeIds,
      },
    });
    setOpenCreate(false);
    setForm(initForm());
    load();
  }

  async function removeEvent(id: string) {
    if (!confirm("일정을 삭제하시겠습니까?")) return;
    await api(`/api/project/${projectId}/events/${id}`, { method: "DELETE" });
    setSelected(null);
    load();
  }

  const headerLabel = useMemo(() => {
    if (mode === "list" || view === "month")
      return cursor.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });
    if (view === "week") {
      const s = startOfWeek(cursor);
      const e = endOfWeek(cursor);
      return `${s.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}`;
    }
    return cursor.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  }, [mode, view, cursor]);

  return (
    <div>
      {/* 헤더: 뷰 스위처 + 네비 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button className="btn-ghost !px-2 !py-1" onClick={() => shift(-1)} aria-label="이전">
            ‹
          </button>
          <div className="font-bold text-slate-900 min-w-[180px] text-center">{headerLabel}</div>
          <button className="btn-ghost !px-2 !py-1" onClick={() => shift(1)} aria-label="다음">
            ›
          </button>
          <button
            className="btn-ghost !px-3 !py-1 text-xs"
            onClick={() => setCursor(new Date())}
          >
            오늘
          </button>
        </div>
        <div className="flex items-center gap-1">
          {/* 캘린더 ↔ 리스트 모드 토글 — 시각적으로 구분해서 첫번째 그룹 */}
          <div className="flex items-center gap-1 mr-2 pr-2 border-r border-slate-200">
            <ViewBtn active={mode === "calendar"} onClick={() => setMode("calendar")}>캘린더</ViewBtn>
            <ViewBtn active={mode === "list"} onClick={() => setMode("list")}>리스트</ViewBtn>
          </div>
          {/* 캘린더 모드에서만 월/주/일 선택 가능 */}
          {mode === "calendar" && (
            <>
              <ViewBtn active={view === "month"} onClick={() => setView("month")}>월</ViewBtn>
              <ViewBtn active={view === "week"} onClick={() => setView("week")}>주</ViewBtn>
              <ViewBtn active={view === "day"} onClick={() => setView("day")}>일</ViewBtn>
            </>
          )}
          <button
            className="btn-primary !px-3 !py-1 text-xs ml-2"
            onClick={() => {
              setForm(initForm(cursor));
              setOpenCreate(true);
            }}
          >
            + 일정
          </button>
        </div>
      </div>

      {/* 담당자 필터 — 전체 / 내 일정 / 멤버별 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-3">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>전체</FilterChip>
        {user?.id && (
          <FilterChip active={filter === "mine"} onClick={() => setFilter("mine")}>
            <span
              className="inline-block w-4 h-4 rounded-full text-white text-[9px] font-bold grid place-items-center mr-1 align-middle"
              style={{ background: memberMap.get(user.id)?.avatarColor ?? "#64748B" }}
            >
              {(memberMap.get(user.id)?.name ?? user.name ?? "나")[0]}
            </span>
            내 일정
          </FilterChip>
        )}
        <span className="mx-1 h-4 w-px bg-slate-200" />
        {members.map((m) => (
          <FilterChip key={m.id} active={filter === m.id} onClick={() => setFilter(m.id)}>
            <span
              className="inline-block w-4 h-4 rounded-full text-white text-[9px] font-bold grid place-items-center mr-1 align-middle"
              style={{ background: m.avatarColor }}
            >
              {m.name[0]}
            </span>
            {m.name}
          </FilterChip>
        ))}
      </div>

      {mode === "calendar" && view === "month" && (
        <MonthGrid cursor={cursor} events={visibleEvents} onPick={(d) => { setCursor(d); setView("day"); }} memberMap={memberMap} />
      )}
      {mode === "calendar" && view === "week" && (
        <WeekView cursor={cursor} eventsOnDay={eventsOnDay} onSelect={setSelected} onPickDay={(d) => { setCursor(d); setView("day"); }} memberMap={memberMap} />
      )}
      {mode === "calendar" && view === "day" && (
        <DayView cursor={cursor} events={eventsOnDay(cursor)} onSelect={setSelected} memberMap={memberMap} />
      )}
      {mode === "list" && (
        <ListView cursor={cursor} events={visibleEvents} onSelect={setSelected} memberMap={memberMap} />
      )}

      {/* 생성 모달 */}
      {openCreate && (
        <div className="fixed inset-0 bg-slate-900/40 grid place-items-center p-4 z-50" onClick={() => setOpenCreate(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">새 일정</h3>
            <form onSubmit={submitCreate} className="space-y-3">
              <div>
                <label className="label">제목</label>
                <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">시작</label>
                  <input type="datetime-local" className="input" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} required />
                </div>
                <div>
                  <label className="label">종료</label>
                  <input type="datetime-local" className="input" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} required />
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} />
                종일
              </label>
              <div>
                <label className="label">색상</label>
                <input type="color" className="w-16 h-8 border border-slate-200 rounded" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </div>
              <div>
                <label className="label">담당자</label>
                {members.length === 0 ? (
                  <div className="text-xs text-slate-400">프로젝트에 멤버가 없습니다.</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto">
                    {members.map((m) => {
                      const on = form.assigneeIds.includes(m.id);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => toggleAssignee(m.id)}
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 hover:bg-slate-50 text-slate-600"}`}
                        >
                          <span
                            className="w-4 h-4 rounded-full grid place-items-center text-white text-[9px] font-bold"
                            style={{ background: m.avatarColor }}
                          >
                            {m.name[0]}
                          </span>
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="label">설명</label>
                <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost" onClick={() => setOpenCreate(false)}>취소</button>
                <button className="btn-primary">등록</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {selected && (
        <div className="fixed inset-0 bg-slate-900/40 grid place-items-center p-4 z-50" onClick={() => setSelected(null)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full" style={{ background: selected.color }} />
              <h3 className="text-lg font-bold flex-1">{selected.title}</h3>
            </div>
            <div className="text-xs text-slate-500 mb-3">
              {new Date(selected.startAt).toLocaleString("ko-KR")} ~ {new Date(selected.endAt).toLocaleString("ko-KR")}
              {selected.allDay && <span className="ml-2 chip bg-slate-100 text-slate-500">종일</span>}
            </div>
            {parseAssignees(selected.assigneeIds).length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] font-bold text-slate-500 mb-1.5">담당자</div>
                <div className="flex flex-wrap gap-1.5">
                  {parseAssignees(selected.assigneeIds).map((uid) => {
                    const m = memberMap.get(uid);
                    if (!m) return null;
                    return (
                      <span
                        key={uid}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 text-xs"
                      >
                        <span
                          className="w-4 h-4 rounded-full grid place-items-center text-white text-[9px] font-bold"
                          style={{ background: m.avatarColor }}
                        >
                          {m.name[0]}
                        </span>
                        {m.name}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {selected.description && (
              <div className="text-sm text-slate-700 whitespace-pre-wrap mb-4">{selected.description}</div>
            )}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setSelected(null)}>닫기</button>
              <button className="btn-ghost text-rose-600" onClick={() => removeEvent(selected.id)}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 담당자 아바타 스택 — 최대 3명 보여주고 나머지는 +N. */
function AssigneeStack({
  ids,
  memberMap,
  size = 18,
}: {
  ids: string[];
  memberMap: Map<string, CalMember>;
  size?: number;
}) {
  if (ids.length === 0) return null;
  const shown = ids.slice(0, 3);
  const extra = ids.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((uid, i) => {
        const m = memberMap.get(uid);
        if (!m) return null;
        return (
          <span
            key={uid}
            className="rounded-full grid place-items-center text-white font-bold border-2 border-white"
            style={{
              background: m.avatarColor,
              width: size,
              height: size,
              fontSize: Math.max(8, Math.floor(size * 0.5)),
              marginLeft: i === 0 ? 0 : -6,
            }}
            title={m.name}
          >
            {m.name[0]}
          </span>
        );
      })}
      {extra > 0 && (
        <span
          className="rounded-full grid place-items-center bg-slate-200 text-slate-600 font-bold border-2 border-white"
          style={{ width: size, height: size, fontSize: Math.max(8, Math.floor(size * 0.45)), marginLeft: -6 }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border transition ${
        active
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function ViewBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-xs font-bold ${active ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}

/* ------------ 월 뷰 ------------ */
function MonthGrid({
  cursor,
  events,
  onPick,
  memberMap,
}: {
  cursor: Date;
  events: ProjectEvent[];
  onPick: (d: Date) => void;
  memberMap: Map<string, CalMember>;
}) {
  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const startDay = first.getDay();
    const total = endOfMonth(cursor).getDate();
    const arr: (Date | null)[] = [];
    for (let i = 0; i < startDay; i++) arr.push(null);
    for (let d = 1; d <= total; d++) arr.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [cursor]);

  function on(d: Date) {
    const s = startOfDay(d);
    const e = endOfDay(d);
    return events.filter((ev) => {
      const es = new Date(ev.startAt);
      const ee = new Date(ev.endAt);
      return es <= e && ee >= s;
    });
  }

  const today = new Date();
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-slate-50 text-xs font-bold text-slate-500">
        {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
          <div
            key={w}
            className={`px-2 py-2 text-center ${i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : ""}`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="min-h-[128px] border-t border-l border-slate-100 bg-slate-50/40" />;
          const evs = on(c);
          const isToday = sameDay(c, today);
          return (
            <button
              key={i}
              onClick={() => onPick(c)}
              className="min-h-[128px] border-t border-l border-slate-100 p-1.5 text-left hover:bg-slate-50 flex flex-col"
            >
              {/* 날짜 + 오늘 점 — flex 로 라인높이 정렬. align-middle 쓰면 오프셋이 생겨 점이 어긋나보임. */}
              <div className={`flex items-center gap-1 text-xs font-bold leading-none mb-1 ${isToday ? "text-brand-600" : "text-slate-700"}`}>
                <span>{c.getDate()}</span>
                {isToday && <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-500" />}
              </div>
              <div className="space-y-0.5">
                {evs.slice(0, 3).map((ev) => {
                  const asg = parseAssignees(ev.assigneeIds);
                  return (
                    <div
                      key={ev.id}
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded text-white"
                      style={{ background: ev.color }}
                      title={ev.title}
                    >
                      {asg.length > 0 && (
                        <AssigneeStack ids={asg} memberMap={memberMap} size={12} />
                      )}
                      <span className="truncate flex-1">{ev.title}</span>
                    </div>
                  );
                })}
                {evs.length > 3 && <div className="text-[10px] text-slate-400">+{evs.length - 3}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------ 주 뷰 ------------ */
function WeekView({
  cursor,
  eventsOnDay,
  onSelect,
  onPickDay,
  memberMap,
}: {
  cursor: Date;
  eventsOnDay: (d: Date) => ProjectEvent[];
  onSelect: (ev: ProjectEvent) => void;
  onPickDay: (d: Date) => void;
  memberMap: Map<string, CalMember>;
}) {
  const s = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(s);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = new Date();
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d, i) => {
        const evs = eventsOnDay(d);
        const isToday = sameDay(d, today);
        return (
          <div key={i} className="border border-slate-200 rounded-lg overflow-hidden flex flex-col min-h-[280px]">
            <button
              onClick={() => onPickDay(d)}
              className={`text-xs font-bold px-2 py-1.5 text-left hover:bg-slate-50 border-b border-slate-100
                ${i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-slate-700"}
                ${isToday ? "bg-brand-50" : ""}`}
            >
              {d.getMonth() + 1}/{d.getDate()} ({["일", "월", "화", "수", "목", "금", "토"][i]})
            </button>
            <div className="flex-1 p-1.5 space-y-1 overflow-auto">
              {evs.map((ev) => {
                const asg = parseAssignees(ev.assigneeIds);
                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelect(ev)}
                    className="w-full text-left text-[11px] px-1.5 py-1 rounded text-white"
                    style={{ background: ev.color }}
                  >
                    <div className="font-semibold truncate">{ev.title}</div>
                    <div className="flex items-center justify-between gap-1">
                      {!ev.allDay ? (
                        <span className="opacity-80">{fmtHHmm(new Date(ev.startAt))}</span>
                      ) : <span />}
                      {asg.length > 0 && <AssigneeStack ids={asg} memberMap={memberMap} size={14} />}
                    </div>
                  </button>
                );
              })}
              {evs.length === 0 && <div className="text-[11px] text-slate-300 text-center py-2">–</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------ 리스트(일자 agenda) 뷰 ------------ */
function ListView({
  cursor,
  events,
  onSelect,
  memberMap,
}: {
  cursor: Date;
  events: ProjectEvent[];
  onSelect: (ev: ProjectEvent) => void;
  memberMap: Map<string, CalMember>;
}) {
  // 시작일 기준 정렬, 해당 일자별로 그룹핑.
  // 걸치는 다일(多日) 이벤트는 일단 시작일에만 노출 — 필요 시 후속에서 확장.
  const groups = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => +new Date(a.startAt) - +new Date(b.startAt)
    );
    const map = new Map<string, { date: Date; list: ProjectEvent[] }>();
    for (const ev of sorted) {
      const d = new Date(ev.startAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) {
        map.set(key, { date: startOfDay(d), list: [] });
      }
      map.get(key)!.list.push(ev);
    }
    return Array.from(map.values());
  }, [events]);

  const today = new Date();
  const monthLabel = cursor.toLocaleDateString("ko-KR", { year: "numeric", month: "long" });

  if (groups.length === 0) {
    return (
      <div className="border border-slate-200 rounded-lg py-20 text-center text-sm text-slate-400">
        {monthLabel}에 등록된 일정이 없습니다.
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
      {groups.map((g) => {
        const isToday = sameDay(g.date, today);
        const weekday = ["일", "월", "화", "수", "목", "금", "토"][g.date.getDay()];
        return (
          <div key={g.date.toISOString()} className="grid grid-cols-[110px_1fr] gap-4 px-4 py-3">
            <div className="text-right">
              <div className={`text-2xl font-bold tabular ${isToday ? "text-brand-600" : "text-slate-800"}`}>
                {g.date.getDate()}
              </div>
              <div className={`text-[11px] font-bold ${g.date.getDay() === 0 ? "text-rose-500" : g.date.getDay() === 6 ? "text-blue-500" : "text-slate-500"}`}>
                {g.date.getMonth() + 1}월 · {weekday}요일
                {isToday && <span className="ml-1 text-brand-500">· 오늘</span>}
              </div>
            </div>
            <div className="space-y-1.5 min-w-0">
              {g.list.map((ev) => {
                const asg = parseAssignees(ev.assigneeIds);
                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelect(ev)}
                    className="w-full flex items-center gap-3 text-left border border-slate-100 rounded-lg px-3 py-2 hover:bg-slate-50"
                  >
                    <span className="w-1.5 h-8 rounded flex-shrink-0" style={{ background: ev.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 truncate">{ev.title}</div>
                      <div className="text-[11px] text-slate-500">
                        {ev.allDay ? (
                          <span>종일</span>
                        ) : (
                          <>
                            {fmtHHmm(new Date(ev.startAt))} – {fmtHHmm(new Date(ev.endAt))}
                          </>
                        )}
                      </div>
                    </div>
                    {asg.length > 0 && <AssigneeStack ids={asg} memberMap={memberMap} size={20} />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------ 일 뷰 ------------ */
function DayView({
  cursor,
  events,
  onSelect,
  memberMap,
}: {
  cursor: Date;
  events: ProjectEvent[];
  onSelect: (ev: ProjectEvent) => void;
  memberMap: Map<string, CalMember>;
}) {
  const allDay = events.filter((e) => e.allDay);
  const timed = events
    .filter((e) => !e.allDay)
    .sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  return (
    <div className="border border-slate-200 rounded-lg p-4 min-h-[360px]">
      {allDay.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-bold text-slate-500 mb-1">종일</div>
          <div className="space-y-1">
            {allDay.map((ev) => (
              <button
                key={ev.id}
                onClick={() => onSelect(ev)}
                className="w-full text-left text-xs px-2 py-1.5 rounded text-white"
                style={{ background: ev.color }}
              >
                {ev.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="text-[10px] font-bold text-slate-500 mb-2">시간 일정</div>
      {timed.length === 0 && allDay.length === 0 && (
        <div className="text-slate-400 text-sm text-center py-16">이 날짜에 일정이 없습니다.</div>
      )}
      <div className="space-y-1.5">
        {timed.map((ev) => {
          const asg = parseAssignees(ev.assigneeIds);
          return (
            <button
              key={ev.id}
              onClick={() => onSelect(ev)}
              className="w-full flex items-center gap-3 text-left border border-slate-100 rounded-lg px-3 py-2 hover:bg-slate-50"
            >
              <span className="w-1.5 h-8 rounded" style={{ background: ev.color }} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">{ev.title}</div>
                <div className="text-[11px] text-slate-500">
                  {fmtHHmm(new Date(ev.startAt))} – {fmtHHmm(new Date(ev.endAt))}
                </div>
              </div>
              {asg.length > 0 && <AssigneeStack ids={asg} memberMap={memberMap} size={20} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
