import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";

type Event = {
  id: string;
  title: string;
  content?: string;
  scope: "COMPANY" | "TEAM" | "PERSONAL";
  team?: string | null;
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
    scope: "PERSONAL" as Event["scope"],
    startAt: "",
    endAt: "",
    color: "#36D7B7",
  });

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
    await api("/api/schedule", {
      method: "POST",
      json: { ...form, startAt: new Date(form.startAt).toISOString(), endAt: new Date(form.endAt).toISOString() },
    });
    setOpen(false);
    setForm({ title: "", content: "", scope: "PERSONAL", startAt: "", endAt: "", color: "#36D7B7" });
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
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
              ←
            </button>
            <div className="font-bold text-slate-800 w-32 text-center">
              {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
            </div>
            <button className="btn-ghost" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
              →
            </button>
            <button className="btn-primary ml-3" onClick={() => setOpen(true)}>
              + 일정 추가
            </button>
          </div>
        }
      />

      <div className="card p-0 overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
          {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
            <div key={d} className={`px-3 py-2 text-xs font-bold text-center ${i === 0 ? "text-rose-500" : i === 6 ? "text-blue-500" : "text-slate-500"}`}>
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
            return (
              <div key={i} className="min-h-[110px] border-b border-r border-slate-100 p-2">
                {d && (
                  <>
                    <div className={`text-xs font-semibold mb-1 ${isToday ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-400 text-white" : i % 7 === 0 ? "text-rose-500" : i % 7 === 6 ? "text-blue-500" : "text-slate-600"}`}>
                      {d.getDate()}
                    </div>
                    <div className="space-y-1">
                      {todays.slice(0, 3).map((e) => (
                        <button
                          key={e.id}
                          onClick={() => remove(e.id)}
                          className="block w-full text-left text-[11px] px-1.5 py-0.5 rounded truncate"
                          style={{ background: e.color + "22", color: e.color }}
                          title={`${e.title} (클릭시 삭제)`}
                        >
                          {e.title}
                        </button>
                      ))}
                      {todays.length > 3 && (
                        <div className="text-[11px] text-slate-400">+{todays.length - 3}건</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 bg-slate-900/40 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">일정 추가</h3>
            <form onSubmit={create} className="space-y-3">
              <div>
                <label className="label">제목</label>
                <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">시작</label>
                  <input type="datetime-local" className="input" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} required />
                </div>
                <div>
                  <label className="label">종료</label>
                  <input type="datetime-local" className="input" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">범위</label>
                  <select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as any })}>
                    <option value="PERSONAL">개인</option>
                    <option value="TEAM">팀</option>
                    {canMakeCompany && <option value="COMPANY">전사</option>}
                  </select>
                </div>
                <div>
                  <label className="label">색상</label>
                  <input type="color" className="input h-[42px] p-1" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">메모</label>
                <textarea className="input" rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  취소
                </button>
                <button className="btn-primary">추가</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
