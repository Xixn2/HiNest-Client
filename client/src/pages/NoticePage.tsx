import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";

type Notice = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  author: { name: string };
};

export default function NoticePage() {
  const { user } = useAuth();
  const [list, setList] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Notice | null>(null);
  const [form, setForm] = useState({ title: "", content: "", pinned: false });

  const canPost = user?.role === "ADMIN" || user?.role === "MANAGER";

  async function load() {
    const res = await api<{ notices: Notice[] }>("/api/notice");
    setList(res.notices);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api("/api/notice", { method: "POST", json: form });
    setOpen(false);
    setForm({ title: "", content: "", pinned: false });
    load();
  }

  async function remove(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    await api(`/api/notice/${id}`, { method: "DELETE" });
    setSelected(null);
    load();
  }

  return (
    <div>
      <PageHeader
        title="사내공지"
        description="회사 전체 공지사항입니다."
        right={canPost && <button className="btn-primary" onClick={() => setOpen(true)}>+ 공지 작성</button>}
      />

      <div className="grid grid-cols-3 gap-6">
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 text-sm font-bold">공지 목록 ({list.length})</div>
          <div className="divide-y divide-slate-100 max-h-[70vh] overflow-auto">
            {list.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelected(n)}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${selected?.id === n.id ? "bg-brand-50" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {n.pinned && <span className="chip bg-rose-100 text-rose-600">고정</span>}
                  <div className="font-semibold text-slate-900 truncate">{n.title}</div>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {n.author?.name} · {new Date(n.createdAt).toLocaleDateString("ko-KR")}
                </div>
              </button>
            ))}
            {list.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-400">공지가 없습니다.</div>}
          </div>
        </div>

        <div className="col-span-2 card">
          {selected ? (
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {selected.pinned && <span className="chip bg-rose-100 text-rose-600">고정</span>}
                    <span>{selected.author?.name}</span>
                    <span>·</span>
                    <span>{new Date(selected.createdAt).toLocaleString("ko-KR")}</span>
                  </div>
                  <h2 className="text-xl font-bold mt-2">{selected.title}</h2>
                </div>
                {canPost && (
                  <button className="btn-ghost" onClick={() => remove(selected.id)}>
                    삭제
                  </button>
                )}
              </div>
              <div className="mt-6 whitespace-pre-wrap text-slate-700 leading-relaxed">{selected.content}</div>
            </div>
          ) : (
            <div className="text-center text-slate-400 py-20">좌측에서 공지를 선택해주세요.</div>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 bg-slate-900/40 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">공지 작성</h3>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="label">제목</label>
                <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
              <div>
                <label className="label">내용</label>
                <textarea className="input" rows={8} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
                상단 고정
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>취소</button>
                <button className="btn-primary">작성</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
