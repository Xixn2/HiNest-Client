import { useEffect, useState } from "react";
import { api, apiSWR } from "../api";
import PageHeader from "../components/PageHeader";
import DateTimePicker from "../components/DateTimePicker";
import { alertAsync } from "../components/ConfirmHost";

type Journal = {
  id: string;
  date: string;
  title: string;
  content: string;
  createdAt: string;
};

/**
 * "오늘" 은 항상 KST 기준. 브라우저 로케일이 한국이 아니어도 일지 날짜 기본값이 서울 날짜가 되도록
 * 명시적 timeZone 사용. 서버 쪽도 동일 규칙(server/src/lib/dates.ts 참고)을 쓰도록 최근 수정됨.
 */
const KST_TODAY = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function today() {
  return KST_TODAY.format(new Date());
}

type Mode = "view" | "create" | "edit";

export default function JournalPage() {
  const [list, setList] = useState<Journal[]>([]);
  const [selected, setSelected] = useState<Journal | null>(null);
  const [form, setForm] = useState({ date: today(), title: "", content: "" });
  const [mode, setMode] = useState<Mode>("view");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  // 삭제 버튼 중복 클릭 방지 + native confirm() 대체용 모달 상태.
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

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

  function openCreate() {
    setMode("create");
    setForm({ date: today(), title: "", content: "" });
    setSelected(null);
    setErr("");
  }

  function openEdit(j: Journal) {
    setMode("edit");
    setSelected(j);
    setForm({ date: j.date, title: j.title, content: j.content });
    setErr("");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErr("");
    try {
      if (mode === "edit" && selected) {
        const res = await api<{ journal: Journal }>(`/api/journal/${selected.id}`, {
          method: "PATCH",
          json: form,
        });
        // 낙관적 업데이트 — 전체 load() 대신 응답값으로 리스트 내 해당 항목만 교체.
        // 서버 왕복 한 번 아끼고 스크롤 위치·선택 상태 유지.
        setList((arr) => arr.map((j) => (j.id === res.journal.id ? res.journal : j)));
        setSelected(res.journal);
      } else {
        const res = await api<{ journal: Journal }>("/api/journal", { method: "POST", json: form });
        // 새 일지를 리스트 맨 앞에 넣음 — 서버도 createdAt desc 로 정렬하므로 동일 순서.
        setList((arr) => [res.journal, ...arr.filter((j) => j.id !== res.journal.id)]);
        setSelected(res.journal);
      }
      setMode("view");
      setForm({ date: today(), title: "", content: "" });
    } catch (e: any) {
      setErr(e?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (removingId) return;
    setRemovingId(id);
    try {
      await api(`/api/journal/${id}`, { method: "DELETE" });
      setList((arr) => arr.filter((j) => j.id !== id));
      if (selected?.id === id) setSelected(null);
      setMode("view");
    } catch (e: any) {
      alertAsync({ title: "삭제 실패", description: e?.message ?? "삭제에 실패했어요" });
    } finally {
      setRemovingId(null);
      setConfirmRemoveId(null);
    }
  }

  const editing = mode !== "view";

  return (
    <div>
      <PageHeader
        title="업무일지"
        description="하루의 업무를 기록하고 회고하세요."
        right={
          <button className="btn-primary" onClick={openCreate}>
            + 새 일지
          </button>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 text-sm font-bold text-slate-800">
            내 일지 ({list.length})
          </div>
          <div className="divide-y divide-slate-100 max-h-[70vh] overflow-auto">
            {list.map((j) => (
              <button
                key={j.id}
                onClick={() => { setSelected(j); setMode("view"); }}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${selected?.id === j.id && mode === "view" ? "bg-brand-50" : ""}`}
              >
                <div className="text-xs text-slate-500">{j.date}</div>
                <div className="font-semibold text-slate-900 truncate">{j.title}</div>
              </button>
            ))}
            {list.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-400">일지가 없습니다.</div>}
          </div>
        </div>

        <div className="lg:col-span-2 card">
          {editing ? (
            <form onSubmit={save} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">날짜</label>
                  <DateTimePicker mode="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
                </div>
                <div>
                  <label className="label">제목</label>
                  <input
                    className="input"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    required
                    maxLength={200}
                  />
                </div>
              </div>
              <div>
                <label className="label">내용</label>
                <textarea
                  className="input"
                  rows={14}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                  maxLength={20_000}
                />
              </div>
              {err && (
                <div className="text-[12px] font-semibold text-red-600">{err}</div>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={saving}
                  onClick={() => {
                    setMode("view");
                    setErr("");
                    // 편집 중이었다면 원본이 그대로 selected 로 유지되어 바로 보기 화면으로 복귀.
                  }}
                >
                  취소
                </button>
                <button className="btn-primary" disabled={saving}>
                  {saving ? "저장 중…" : mode === "edit" ? "수정 저장" : "저장"}
                </button>
              </div>
            </form>
          ) : selected ? (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">{selected.date}</div>
                  <h2 className="text-xl font-bold mt-1 break-words">{selected.title}</h2>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button className="btn-ghost btn-xs" onClick={() => openEdit(selected)} disabled={removingId === selected.id}>
                    수정
                  </button>
                  <button
                    className="btn-ghost btn-xs text-red-600 hover:text-red-700 disabled:opacity-60"
                    onClick={() => setConfirmRemoveId(selected.id)}
                    disabled={removingId === selected.id}
                  >
                    {removingId === selected.id ? "삭제 중…" : "삭제"}
                  </button>
                </div>
              </div>
              <div className="mt-6 whitespace-pre-wrap text-slate-700 leading-relaxed break-words">
                {selected.content}
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-400 py-20">일지를 선택하거나 새로 작성하세요.</div>
          )}
        </div>
      </div>

      {confirmRemoveId && (
        <div
          className="fixed inset-0 bg-slate-900/40 grid place-items-center p-4 z-50"
          onClick={() => removingId ? null : setConfirmRemoveId(null)}
        >
          <div className="card w-full max-w-[400px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">일지 삭제</h3>
            <p className="text-sm text-slate-600 mt-2">
              이 일지를 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button
                className="btn-ghost"
                onClick={() => setConfirmRemoveId(null)}
                disabled={!!removingId}
              >
                취소
              </button>
              <button
                className="btn-primary bg-red-600 hover:bg-red-700"
                onClick={() => remove(confirmRemoveId)}
                disabled={!!removingId}
              >
                {removingId ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
