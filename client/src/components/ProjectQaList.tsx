import { useEffect, useRef, useState } from "react";
import { api, apiSWR } from "../api";
import { confirmAsync } from "./ConfirmHost";

type Status = "OPEN" | "PASSED" | "FAILED" | "SKIPPED";
type Priority = "LOW" | "NORMAL" | "HIGH";

type QaUser = { id: string; name: string; avatarColor: string };

type QaItem = {
  id: string;
  projectId: string;
  title: string;
  note: string | null;
  status: Status;
  priority: Priority;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  createdBy: QaUser | null;
  resolvedBy: QaUser | null;
};

const STATUS_LABEL: Record<Status, string> = {
  OPEN: "대기",
  PASSED: "통과",
  FAILED: "실패",
  SKIPPED: "생략",
};

// Pill 색상 — 탭과 배지 모두에서 동일 팔레트를 공유.
const STATUS_CLASS: Record<Status, string> = {
  OPEN: "bg-slate-100 text-slate-700",
  PASSED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-rose-50 text-rose-700",
  SKIPPED: "bg-amber-50 text-amber-700",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "낮음",
  NORMAL: "보통",
  HIGH: "높음",
};

const PRIORITY_CLASS: Record<Priority, string> = {
  LOW: "bg-slate-50 text-slate-500",
  NORMAL: "bg-brand-50 text-brand-600",
  HIGH: "bg-rose-50 text-rose-700",
};

type Filter = "ALL" | Status;

/**
 * 프로젝트 QA 체크리스트 — 무엇을 테스트했고 결과가 어땠는지 기록하는 용도.
 * 서버측 상태 전환 시 resolvedBy/At 가 자동 기록됨.
 */
export default function ProjectQaList({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<QaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [initStatus, setInitStatus] = useState<Status>("OPEN");
  const [submitting, setSubmitting] = useState(false);
  const [expandedNote, setExpandedNote] = useState<Record<string, boolean>>({});

  // 채널 전환이나 동일 projectId 에서의 재로드 시 stale 응답이 최신값을 덮지 않도록.
  const tokenRef = useRef(0);

  async function load() {
    const my = ++tokenRef.current;
    await apiSWR<{ items: QaItem[] }>(`/api/project/${projectId}/qa`, {
      onCached: (r) => {
        if (my !== tokenRef.current) return;
        setItems(r.items);
        setLoaded(true);
      },
      onFresh: (r) => {
        if (my !== tokenRef.current) return;
        setItems(r.items);
        setLoaded(true);
      },
      onError: () => {
        if (my !== tokenRef.current) return;
        setLoaded(true);
      },
    });
  }

  useEffect(() => {
    tokenRef.current++;
    setItems([]);
    setLoaded(false);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || submitting) return;
    setSubmitting(true);
    try {
      const r = await api<{ item: QaItem }>(`/api/project/${projectId}/qa`, {
        method: "POST",
        json: {
          title: t,
          note: note.trim() || undefined,
          priority,
          status: initStatus,
        },
      });
      // createdBy 는 서버 GET 에서 별도로 조인되지만, 생성 응답은 순수 레코드라 그대로 넣음.
      // 화면에서는 "내가 방금 추가" 라는 사실이 더 중요해 author 정보 없이도 OK.
      setItems((prev) => [
        ...prev,
        { ...r.item, createdBy: null, resolvedBy: null } as QaItem,
      ]);
      setTitle("");
      setNote("");
      setPriority("NORMAL");
      setInitStatus("OPEN");
    } catch (err: any) {
      alert(err?.message ?? "추가에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  }

  async function patchItem(id: string, patch: Partial<Pick<QaItem, "status" | "priority" | "title" | "note">>) {
    // 낙관적 업데이트 — 실패 시 이전 상태로 롤백.
    const snapshot = items;
    setItems((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    try {
      const r = await api<{ item: QaItem }>(`/api/project/${projectId}/qa/${id}`, {
        method: "PATCH",
        json: patch,
      });
      // 서버가 resolvedBy/At 을 갱신했을 수 있어 응답의 핵심 필드를 반영.
      setItems((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                ...r.item,
                // createdBy/resolvedBy 조인 정보가 응답에 없어 기존값 유지. 재로드 시 최신화됨.
                createdBy: x.createdBy,
                resolvedBy: x.resolvedBy,
              }
            : x,
        ),
      );
    } catch (err: any) {
      setItems(snapshot);
      alert(err?.message ?? "수정에 실패했어요");
    }
  }

  async function removeItem(id: string, title: string) {
    const ok = await confirmAsync({
      title: "QA 항목 삭제",
      description: `"${title}" 항목을 삭제할까요?`,
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    const snapshot = items;
    setItems((prev) => prev.filter((x) => x.id !== id));
    try {
      await api(`/api/project/${projectId}/qa/${id}`, { method: "DELETE" });
    } catch (err: any) {
      setItems(snapshot);
      alert(err?.message ?? "삭제에 실패했어요");
    }
  }

  const visible = filter === "ALL" ? items : items.filter((i) => i.status === filter);
  const counts = {
    ALL: items.length,
    OPEN: items.filter((i) => i.status === "OPEN").length,
    PASSED: items.filter((i) => i.status === "PASSED").length,
    FAILED: items.filter((i) => i.status === "FAILED").length,
    SKIPPED: items.filter((i) => i.status === "SKIPPED").length,
  } as const;

  return (
    <div>
      <div className="section-head">
        <div className="title">QA 체크리스트</div>
        <div className="text-[12px] text-ink-500">
          무엇을 검증했고 결과가 어땠는지 기록하세요.
        </div>
      </div>

      {/* 필터 탭 */}
      <div className="flex flex-wrap gap-1.5 mt-3 mb-3">
        {(["ALL", "OPEN", "PASSED", "FAILED", "SKIPPED"] as const).map((k) => {
          const active = filter === k;
          return (
            <button
              key={k}
              type="button"
              className={[
                "px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors",
                active
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              ].join(" ")}
              onClick={() => setFilter(k)}
            >
              {k === "ALL" ? "전체" : STATUS_LABEL[k]}{" "}
              <span className={active ? "text-white/80" : "text-slate-400"}>
                {counts[k]}
              </span>
            </button>
          );
        })}
      </div>

      {/* 추가 폼 */}
      <form onSubmit={addItem} className="flex flex-col gap-2 mb-4 border border-slate-100 rounded-xl p-3 bg-slate-50/60">
        <input
          className="input w-full"
          placeholder="테스트 / 확인할 항목 (예: 로그인 후 대시보드 진입)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
        <textarea
          className="input w-full min-h-[60px] resize-y"
          placeholder="상세 메모 (선택) — 재현 스텝, 기대 결과, 비고"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={4000}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input w-auto"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            <option value="LOW">우선순위 · 낮음</option>
            <option value="NORMAL">우선순위 · 보통</option>
            <option value="HIGH">우선순위 · 높음</option>
          </select>
          <select
            className="input w-auto"
            value={initStatus}
            onChange={(e) => setInitStatus(e.target.value as Status)}
            title="처음 기록 시 결과"
          >
            <option value="OPEN">대기 상태로</option>
            <option value="PASSED">통과로 기록</option>
            <option value="FAILED">실패로 기록</option>
            <option value="SKIPPED">생략으로 기록</option>
          </select>
          <div className="flex-1" />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !title.trim()}
          >
            추가
          </button>
        </div>
      </form>

      {/* 목록 */}
      {!loaded ? (
        <div className="text-center text-slate-400 text-sm py-6">불러오는 중…</div>
      ) : visible.length === 0 ? (
        <div className="text-center text-slate-400 text-sm py-6">
          {filter === "ALL"
            ? "아직 기록된 QA 항목이 없어요."
            : "해당 상태의 항목이 없어요."}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((i) => {
            const expanded = !!expandedNote[i.id];
            return (
              <li
                key={i.id}
                className="border border-slate-100 rounded-xl p-3 bg-white hover:border-slate-200 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`chip text-[11px] px-2 py-0.5 ${STATUS_CLASS[i.status]}`}
                      >
                        {STATUS_LABEL[i.status]}
                      </span>
                      <span
                        className={`chip text-[11px] px-2 py-0.5 ${PRIORITY_CLASS[i.priority]}`}
                      >
                        {PRIORITY_LABEL[i.priority]}
                      </span>
                      <span className="text-[13px] font-semibold break-words">{i.title}</span>
                    </div>

                    {i.note && (
                      <div className="mt-1.5">
                        <div
                          className={[
                            "text-[12px] text-slate-600 whitespace-pre-wrap break-words",
                            expanded ? "" : "line-clamp-2",
                          ].join(" ")}
                        >
                          {i.note}
                        </div>
                        {i.note.length > 80 && (
                          <button
                            type="button"
                            className="text-[11px] text-brand-600 hover:underline mt-0.5"
                            onClick={() =>
                              setExpandedNote((prev) => ({ ...prev, [i.id]: !prev[i.id] }))
                            }
                          >
                            {expanded ? "접기" : "더 보기"}
                          </button>
                        )}
                      </div>
                    )}

                    <div className="mt-1.5 text-[11px] text-slate-400 flex flex-wrap gap-x-2">
                      {i.createdBy && <span>작성 · {i.createdBy.name}</span>}
                      {i.resolvedBy && i.resolvedAt && i.status !== "OPEN" && (
                        <span>
                          {STATUS_LABEL[i.status]} · {i.resolvedBy.name} ·{" "}
                          {new Date(i.resolvedAt).toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <select
                      className="input w-auto text-[12px] py-1"
                      value={i.status}
                      onChange={(e) => patchItem(i.id, { status: e.target.value as Status })}
                      title="상태 변경"
                    >
                      <option value="OPEN">대기</option>
                      <option value="PASSED">통과</option>
                      <option value="FAILED">실패</option>
                      <option value="SKIPPED">생략</option>
                    </select>
                    <button
                      type="button"
                      className="btn-icon text-slate-400 hover:text-rose-600"
                      title="삭제"
                      aria-label="삭제"
                      onClick={() => removeItem(i.id, i.title)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
