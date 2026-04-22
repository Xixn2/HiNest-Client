import { useEffect, useMemo, useRef, useState } from "react";
import { api, apiSWR } from "../api";
import { confirmAsync } from "./ConfirmHost";

type Status = "OPEN" | "PASSED" | "FAILED" | "SKIPPED";
type Priority = "LOW" | "NORMAL" | "HIGH";
type Platform = "WEB" | "IOS" | "ANDROID" | "MAC_APP" | "WINDOWS_APP" | "OTHER";
type AttachmentKind = "IMAGE" | "VIDEO" | "FILE";

type QaUser = { id: string; name: string; avatarColor: string };

type Attachment = {
  id: string;
  qaItemId: string;
  url: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  kind: AttachmentKind;
  createdAt: string;
};

type QaItem = {
  id: string;
  projectId: string;
  title: string;
  note: string | null;
  screen: string | null;
  platform: Platform | null;
  assigneeId: string | null;
  status: Status;
  priority: Priority;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  createdBy: QaUser | null;
  resolvedBy: QaUser | null;
  assignee: QaUser | null;
  attachments: Attachment[];
};

type Member = { id: string; name: string; avatarColor: string };

const STATUS_LABEL: Record<Status, string> = {
  OPEN: "대기",
  PASSED: "통과",
  FAILED: "실패",
  SKIPPED: "생략",
};

// 라이트/다크 양쪽에서 대비가 맞는 design-token 기반 chip 클래스로 매핑.
const STATUS_CHIP: Record<Status, string> = {
  OPEN: "chip chip-gray",
  PASSED: "chip chip-green",
  FAILED: "chip chip-red",
  SKIPPED: "chip chip-amber",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "낮음",
  NORMAL: "보통",
  HIGH: "높음",
};

const PRIORITY_CHIP: Record<Priority, string> = {
  LOW: "chip chip-gray",
  NORMAL: "chip chip-blue",
  HIGH: "chip chip-red",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  WEB: "Web",
  IOS: "iOS",
  ANDROID: "Android",
  MAC_APP: "macOS 앱",
  WINDOWS_APP: "Windows 앱",
  OTHER: "기타",
};

const PLATFORM_ICON: Record<Platform, string> = {
  WEB: "🌐",
  IOS: "",
  ANDROID: "🤖",
  MAC_APP: "🖥",
  WINDOWS_APP: "🪟",
  OTHER: "📦",
};

type Filter = "ALL" | Status;

// 간단한 바이트 포매팅 — 첨부 사이즈 라벨에 사용.
function humanSize(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * 프로젝트 QA 체크리스트 — 버그/확인 항목을 기록한다.
 *
 * 기록 요소
 *  - 제목 + 메모 (재현 스텝)
 *  - 문제 화면(screen) / 재현 플랫폼(platform)
 *  - 담당자(assigneeId) — 프로젝트 멤버 중 선택
 *  - 이미지/영상/파일 첨부 (복수)
 *  - 상태(대기/통과/실패/생략) · 우선순위(낮음/보통/높음)
 *
 * 상태 전환 시 서버가 resolvedBy/At 를 자동 스탬프.
 */
export default function ProjectQaList({
  projectId,
  members,
}: {
  projectId: string;
  members: Member[];
}) {
  const [items, setItems] = useState<QaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");

  // ---------- 추가 폼 상태 ----------
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [screen, setScreen] = useState("");
  const [platform, setPlatform] = useState<Platform | "">("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [initStatus, setInitStatus] = useState<Status>("OPEN");
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const [expandedNote, setExpandedNote] = useState<Record<string, boolean>>({});

  // 채널/프로젝트 전환 시 stale 응답 방지.
  const tokenRef = useRef(0);

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members],
  );

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

  // ---------- 파일 업로드 ----------
  async function uploadToServer(file: File): Promise<Attachment> {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", credentials: "include", body: fd });
    if (!r.ok) {
      let msg = "업로드 실패";
      try {
        const d = await r.json();
        if (d?.error) msg = d.error;
      } catch {}
      throw new Error(msg);
    }
    const d = (await r.json()) as {
      url: string; name: string; type: string; size: number;
      kind: "IMAGE" | "VIDEO" | "FILE";
    };
    return {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      qaItemId: "",
      url: d.url,
      name: d.name,
      mimeType: d.type,
      sizeBytes: d.size,
      kind: d.kind,
      createdAt: new Date().toISOString(),
    };
  }

  async function handleAddFormFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        try {
          const att = await uploadToServer(f);
          setPendingFiles((prev) => [...prev, att]);
        } catch (e: any) {
          alert(e?.message ?? "업로드 실패");
        }
      }
    } finally {
      setUploading(false);
      if (addFileInputRef.current) addFileInputRef.current.value = "";
    }
  }

  // ---------- 추가 제출 ----------
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
          screen: screen.trim() || undefined,
          platform: platform || undefined,
          assigneeId: assigneeId || undefined,
          priority,
          status: initStatus,
          attachments: pendingFiles.map((a) => ({
            url: a.url,
            name: a.name,
            mimeType: a.mimeType,
            sizeBytes: a.sizeBytes,
            kind: a.kind,
          })),
        },
      });
      // 서버 응답은 createdBy/assignee join 이 없어 있는 것만 최대한 채움.
      const newItem: QaItem = {
        ...r.item,
        createdBy: null,
        resolvedBy: null,
        assignee: r.item.assigneeId
          ? memberMap.get(r.item.assigneeId) ?? null
          : null,
        attachments: r.item.attachments ?? [],
      };
      setItems((prev) => [...prev, newItem]);
      setTitle("");
      setNote("");
      setScreen("");
      setPlatform("");
      setAssigneeId("");
      setPriority("NORMAL");
      setInitStatus("OPEN");
      setPendingFiles([]);
    } catch (err: any) {
      alert(err?.message ?? "추가에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- 항목 수정 ----------
  async function patchItem(
    id: string,
    patch: Partial<Pick<QaItem, "status" | "priority" | "title" | "note" | "screen" | "platform" | "assigneeId">>,
  ) {
    const snapshot = items;
    // 낙관적 반영 — assignee 필드는 memberMap 으로 즉시 join.
    setItems((prev) =>
      prev.map((x) =>
        x.id === id
          ? {
              ...x,
              ...patch,
              assignee:
                "assigneeId" in patch
                  ? patch.assigneeId
                    ? memberMap.get(patch.assigneeId) ?? null
                    : null
                  : x.assignee,
            }
          : x,
      ),
    );
    try {
      const r = await api<{ item: QaItem }>(`/api/project/${projectId}/qa/${id}`, {
        method: "PATCH",
        json: patch,
      });
      setItems((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                ...r.item,
                // 목록 GET 이 오기 전까지 join 정보는 기존값 유지 + assignee 는 memberMap 으로 재계산.
                createdBy: x.createdBy,
                resolvedBy: x.resolvedBy,
                assignee: r.item.assigneeId ? memberMap.get(r.item.assigneeId) ?? null : null,
                attachments: r.item.attachments ?? x.attachments,
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

  // ---------- 기존 항목에 첨부 추가/삭제 ----------
  async function addAttachment(itemId: string, files: FileList | null) {
    if (!files || !files.length) return;
    for (const f of Array.from(files)) {
      try {
        const local = await uploadToServer(f);
        const r = await api<{ attachment: Attachment }>(
          `/api/project/${projectId}/qa/${itemId}/attachment`,
          {
            method: "POST",
            json: {
              url: local.url,
              name: local.name,
              mimeType: local.mimeType,
              sizeBytes: local.sizeBytes,
              kind: local.kind,
            },
          },
        );
        setItems((prev) =>
          prev.map((x) =>
            x.id === itemId ? { ...x, attachments: [...x.attachments, r.attachment] } : x,
          ),
        );
      } catch (e: any) {
        alert(e?.message ?? "첨부 추가 실패");
      }
    }
  }

  async function removeAttachment(itemId: string, attachmentId: string) {
    const snapshot = items;
    setItems((prev) =>
      prev.map((x) =>
        x.id === itemId
          ? { ...x, attachments: x.attachments.filter((a) => a.id !== attachmentId) }
          : x,
      ),
    );
    try {
      await api(`/api/project/${projectId}/qa/${itemId}/attachment/${attachmentId}`, {
        method: "DELETE",
      });
    } catch (err: any) {
      setItems(snapshot);
      alert(err?.message ?? "첨부 삭제 실패");
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
          테스트 항목·버그 제보를 기록하고 담당자·화면·플랫폼까지 한곳에서 관리합니다.
        </div>
      </div>

      {/* 필터 탭 — chip-* 토큰 사용으로 다크모드에서도 자동 대응 */}
      <div className="flex flex-wrap gap-1.5 mt-3 mb-3">
        {(["ALL", "OPEN", "PASSED", "FAILED", "SKIPPED"] as const).map((k) => {
          const active = filter === k;
          return (
            <button
              key={k}
              type="button"
              className={[
                "px-2.5 py-1 rounded-full text-[12px] font-medium transition-colors",
                active ? "chip chip-brand" : "chip chip-gray",
              ].join(" ")}
              onClick={() => setFilter(k)}
            >
              {k === "ALL" ? "전체" : STATUS_LABEL[k]}{" "}
              <span className="opacity-70">{counts[k]}</span>
            </button>
          );
        })}
      </div>

      {/* 추가 폼 */}
      <form
        onSubmit={addItem}
        className="flex flex-col gap-2 mb-4 border border-ink-100 rounded-xl p-3 bg-ink-25"
      >
        <input
          className="input w-full"
          placeholder="테스트 / 확인할 항목 (예: 로그인 후 대시보드 진입)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            className="input w-full"
            placeholder="문제 화면 / 위치 (예: 설정 > 프로필 편집)"
            value={screen}
            onChange={(e) => setScreen(e.target.value)}
            maxLength={200}
          />
          <select
            className="input w-full"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform | "")}
            title="재현 플랫폼"
          >
            <option value="">플랫폼 (미지정)</option>
            <option value="WEB">🌐 Web</option>
            <option value="IOS"> iOS</option>
            <option value="ANDROID">🤖 Android</option>
            <option value="MAC_APP">🖥 macOS 앱</option>
            <option value="WINDOWS_APP">🪟 Windows 앱</option>
            <option value="OTHER">📦 기타</option>
          </select>
        </div>

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
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            title="담당자"
          >
            <option value="">담당자 미지정</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                담당 · {m.name}
              </option>
            ))}
          </select>
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
        </div>

        {/* 파일 업로드 */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={addFileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleAddFormFiles(e.target.files)}
          />
          <button
            type="button"
            className="chip chip-gray"
            onClick={() => addFileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "업로드 중…" : "📎 사진/영상 첨부"}
          </button>
          {pendingFiles.length > 0 && (
            <span className="text-[12px] text-ink-500">
              {pendingFiles.length}개 준비됨
            </span>
          )}
          <div className="flex-1" />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || uploading || !title.trim()}
          >
            {submitting ? "추가 중…" : "추가"}
          </button>
        </div>

        {/* 준비된 첨부 미리보기 */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((a, idx) => (
              <AttachmentThumb
                key={a.id}
                att={a}
                onRemove={() =>
                  setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
                }
              />
            ))}
          </div>
        )}
      </form>

      {/* 목록 */}
      {!loaded ? (
        <div className="text-center text-ink-400 text-sm py-6">불러오는 중…</div>
      ) : visible.length === 0 ? (
        <div className="text-center text-ink-400 text-sm py-6">
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
                className="border border-ink-100 rounded-xl p-3 bg-ink-25"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* 상단 메타 줄 */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={STATUS_CHIP[i.status]}>
                        {STATUS_LABEL[i.status]}
                      </span>
                      <span className={PRIORITY_CHIP[i.priority]}>
                        {PRIORITY_LABEL[i.priority]}
                      </span>
                      {i.platform && (
                        <span className="chip chip-blue">
                          {PLATFORM_ICON[i.platform]} {PLATFORM_LABEL[i.platform]}
                        </span>
                      )}
                      {i.screen && (
                        <span className="chip chip-gray" title="문제 화면">
                          📍 {i.screen}
                        </span>
                      )}
                      <span className="text-[13px] font-semibold break-words text-ink-900">
                        {i.title}
                      </span>
                    </div>

                    {/* 담당자 */}
                    {i.assignee && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-600">
                        <span
                          className="inline-flex items-center justify-center rounded-full text-white"
                          style={{
                            background: i.assignee.avatarColor,
                            width: 18,
                            height: 18,
                            fontSize: 11,
                          }}
                        >
                          {i.assignee.name[0]}
                        </span>
                        <span>담당 · {i.assignee.name}</span>
                      </div>
                    )}

                    {/* 메모 */}
                    {i.note && (
                      <div className="mt-1.5">
                        <div
                          className={[
                            "text-[12px] text-ink-600 whitespace-pre-wrap break-words",
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

                    {/* 첨부 썸네일 */}
                    {i.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {i.attachments.map((a) => (
                          <AttachmentThumb
                            key={a.id}
                            att={a}
                            onRemove={() => removeAttachment(i.id, a.id)}
                          />
                        ))}
                      </div>
                    )}

                    <div className="mt-1.5 text-[11px] text-ink-400 flex flex-wrap gap-x-2">
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

                  {/* 액션 */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
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
                    <select
                      className="input w-auto text-[12px] py-1"
                      value={i.assigneeId ?? ""}
                      onChange={(e) => patchItem(i.id, { assigneeId: e.target.value || null })}
                      title="담당자 변경"
                    >
                      <option value="">담당자 미지정</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <label
                        className="btn-icon text-ink-400 hover:text-brand-600 cursor-pointer"
                        title="첨부 추가"
                        aria-label="첨부 추가"
                      >
                        <input
                          type="file"
                          multiple
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => {
                            addAttachment(i.id, e.target.files);
                            e.target.value = "";
                          }}
                        />
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                        </svg>
                      </label>
                      <button
                        type="button"
                        className="btn-icon text-ink-400 hover:text-rose-600"
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * 첨부 썸네일 — 이미지/영상은 인라인 미리보기, 그 외는 파일명 칩.
 * 클릭 시 새 탭에서 원본 열기. 오른쪽 × 로 제거.
 */
function AttachmentThumb({
  att,
  onRemove,
}: {
  att: Attachment;
  onRemove?: () => void;
}) {
  const box = "relative group rounded-lg overflow-hidden border border-ink-100 bg-ink-25";
  if (att.kind === "IMAGE") {
    return (
      <div className={box} style={{ width: 96, height: 96 }}>
        <a href={att.url} target="_blank" rel="noreferrer" title={att.name}>
          <img
            src={att.url}
            alt={att.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </a>
        {onRemove && <RemoveDot onRemove={onRemove} />}
      </div>
    );
  }
  if (att.kind === "VIDEO") {
    return (
      <div className={box} style={{ width: 160, height: 96 }}>
        <video
          src={att.url}
          className="w-full h-full object-cover"
          controls
          preload="metadata"
        />
        {onRemove && <RemoveDot onRemove={onRemove} />}
      </div>
    );
  }
  return (
    <div
      className={[box, "flex items-center gap-2 px-2 py-1.5 text-[12px]"].join(" ")}
      style={{ maxWidth: 240 }}
    >
      <span>📎</span>
      <a
        href={att.url}
        target="_blank"
        rel="noreferrer"
        className="truncate text-ink-700 hover:underline"
        title={att.name}
      >
        {att.name}
      </a>
      <span className="text-ink-400">{humanSize(att.sizeBytes)}</span>
      {onRemove && <RemoveDot onRemove={onRemove} />}
    </div>
  );
}

function RemoveDot({ onRemove }: { onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[11px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      aria-label="첨부 제거"
      title="제거"
    >
      ×
    </button>
  );
}
