import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, apiSWR, invalidateCache } from "../api";
import { useAuth } from "../auth";
import { useNotifications } from "../notifications";
import PageHeader from "../components/PageHeader";
import { confirmAsync, alertAsync } from "../components/ConfirmHost";

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
  const { bellItems, markRead } = useNotifications();
  const [list, setList] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Notice | null>(null);
  const [form, setForm] = useState({ title: "", content: "", pinned: false });
  const [params, setParams] = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const canPost = user?.role === "ADMIN" || user?.role === "MANAGER";

  // 벨 알림 중 "공지" 타입의 미읽음을 noticeId -> notificationId 맵으로 인덱싱
  const unreadByNoticeId = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of bellItems) {
      if (n.type !== "NOTICE" || n.readAt) continue;
      const match = n.linkUrl?.match(/id=([^&]+)/);
      if (match) m.set(match[1], n.id);
    }
    return m;
  }, [bellItems]);

  async function load() {
    const res = await api<{ notices: Notice[] }>("/api/notice");
    setList(res.notices);
  }

  // 첫 진입은 SWR — 이전 캐시가 있으면 즉시 렌더하고, 네트워크로 최신값 병합.
  useEffect(() => {
    apiSWR<{ notices: Notice[] }>("/api/notice", {
      onCached: (d) => setList(d.notices),
      onFresh: (d) => setList(d.notices),
    });
  }, []);

  // 알림 등에서 ?id=... 로 들어왔을 때 자동 선택
  useEffect(() => {
    const id = params.get("id");
    if (!id || list.length === 0) return;
    const found = list.find((n) => n.id === id);
    if (found) {
      setSelected(found);
      const notifId = unreadByNoticeId.get(found.id);
      if (notifId) markRead([notifId]);
    }
  }, [params, list, unreadByNoticeId, markRead]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveErr(null);
    try {
      await api("/api/notice", { method: "POST", json: form });
      invalidateCache("/api/notice");
      // 낙관적 삽입 — 서버가 방금 생성한 공지를 곧 반환하겠지만, 목록 맨 위(또는 고정이면 맨 위)에 즉시 반영.
      setOpen(false);
      setForm({ title: "", content: "", pinned: false });
      await load();
    } catch (e: any) {
      setSaveErr(e?.message ?? "공지 등록에 실패했어요");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (removingId) return;
    const ok = await confirmAsync({
      title: "공지 삭제",
      description: "이 공지를 삭제할까요? 되돌릴 수 없어요.",
      tone: "danger",
      confirmLabel: "삭제",
    });
    if (!ok) return;
    setRemovingId(id);
    // 낙관적 업데이트 — 목록에서 즉시 제거.
    const prev = list;
    setList((xs) => xs.filter((n) => n.id !== id));
    setSelected(null);
    try {
      await api(`/api/notice/${id}`, { method: "DELETE" });
      invalidateCache("/api/notice");
    } catch (e: any) {
      // 실패 시 복구.
      setList(prev);
      alertAsync({ title: "삭제 실패", description: e?.message ?? "삭제에 실패했어요" });
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="사내공지"
        description="회사 전체 공지사항입니다."
        right={canPost && <button className="btn-primary" onClick={() => setOpen(true)}>+ 공지 작성</button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 text-sm font-bold">공지 목록 ({list.length})</div>
          <div className="divide-y divide-slate-100 max-h-[70vh] overflow-auto">
            {list.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  setSelected(n);
                  // URL 동기화 — 새로고침/공유 시에도 같은 공지 유지
                  const next = new URLSearchParams(params);
                  next.set("id", n.id);
                  setParams(next, { replace: true });
                  // 해당 공지에 대한 미읽음 알림이 있으면 읽음 처리
                  const notifId = unreadByNoticeId.get(n.id);
                  if (notifId) markRead([notifId]);
                }}
                className={`relative w-full text-left px-4 py-3 hover:bg-slate-50 ${selected?.id === n.id ? "bg-brand-50" : ""}`}
              >
                {unreadByNoticeId.has(n.id) && (
                  <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-brand-500" />
                )}
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

        <div className="lg:col-span-2 card">
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
                  <button
                    className="btn-ghost"
                    onClick={() => remove(selected.id)}
                    disabled={removingId === selected.id}
                  >
                    {removingId === selected.id ? "삭제 중…" : "삭제"}
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
                <input
                  className="input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  maxLength={200}
                />
              </div>
              <div>
                <label className="label">내용</label>
                <textarea
                  className="input"
                  rows={8}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  required
                  maxLength={20_000}
                />
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
