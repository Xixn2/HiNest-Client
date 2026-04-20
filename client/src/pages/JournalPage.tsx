import { useEffect, useState } from "react";
import { api, apiSWR } from "../api";
import PageHeader from "../components/PageHeader";
import DateTimePicker from "../components/DateTimePicker";

type Journal = {
  id: string;
  date: string;
  title: string;
  content: string;
  createdAt: string;
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function JournalPage() {
  const [list, setList] = useState<Journal[]>([]);
  const [selected, setSelected] = useState<Journal | null>(null);
  const [form, setForm] = useState({ date: today(), title: "", content: "" });
  const [editing, setEditing] = useState(false);

  async function load() {
    const res = await api<{ journals: Journal[] }>("/api/journal");
    setList(res.journals);
    if (res.journals.length && !selected) setSelected(res.journals[0]);
  }

  // SWR — 탭 안에서 재진입 시 즉시 리스트 렌더.
  useEffect(() => {
    apiSWR<{ journals: Journal[] }>("/api/journal", {
      onCached: (d) => {
        setList(d.journals);
        if (d.journals.length && !selected) setSelected(d.journals[0]);
      },
      onFresh: (d) => {
        setList(d.journals);
        if (d.journals.length && !selected) setSelected(d.journals[0]);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const res = await api<{ journal: Journal }>("/api/journal", { method: "POST", json: form });
    setForm({ date: today(), title: "", content: "" });
    setEditing(false);
    setSelected(res.journal);
    load();
  }

  async function remove(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    await api(`/api/journal/${id}`, { method: "DELETE" });
    if (selected?.id === id) setSelected(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="업무일지"
        description="하루의 업무를 기록하고 회고하세요."
        right={
          <button className="btn-primary" onClick={() => { setEditing(true); setSelected(null); }}>
            + 새 일지
          </button>
        }
      />
      <div className="grid grid-cols-3 gap-6">
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 text-sm font-bold text-slate-800">
            내 일지 ({list.length})
          </div>
          <div className="divide-y divide-slate-100 max-h-[70vh] overflow-auto">
            {list.map((j) => (
              <button
                key={j.id}
                onClick={() => { setSelected(j); setEditing(false); }}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${selected?.id === j.id ? "bg-brand-50" : ""}`}
              >
                <div className="text-xs text-slate-500">{j.date}</div>
                <div className="font-semibold text-slate-900 truncate">{j.title}</div>
              </button>
            ))}
            {list.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-400">일지가 없습니다.</div>}
          </div>
        </div>

        <div className="col-span-2 card">
          {editing ? (
            <form onSubmit={create} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">날짜</label>
                  <DateTimePicker mode="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
                </div>
                <div>
                  <label className="label">제목</label>
                  <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="label">내용</label>
                <textarea className="input" rows={14} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
                  취소
                </button>
                <button className="btn-primary">저장</button>
              </div>
            </form>
          ) : selected ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-slate-500">{selected.date}</div>
                  <h2 className="text-xl font-bold mt-1">{selected.title}</h2>
                </div>
                <button className="btn-ghost" onClick={() => remove(selected.id)}>
                  삭제
                </button>
              </div>
              <div className="mt-6 whitespace-pre-wrap text-slate-700 leading-relaxed">
                {selected.content}
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-400 py-20">일지를 선택하거나 새로 작성하세요.</div>
          )}
        </div>
      </div>
    </div>
  );
}
