import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, apiSWR } from "../api";
import { useAuth } from "../auth";
// TipTap 에디터는 ~300KB 덩어리 — 회의록 상세 페이지 안에서 다시 한 번 나눠서
// 제목/메타/공개범위 UI 가 먼저 보이고, 에디터는 뒤따라 로드되도록 함.
const MeetingEditor = lazy(() => import("../components/MeetingEditor"));

type Visibility = "ALL" | "PROJECT" | "SPECIFIC";

type Viewer = {
  id: string;
  userId: string;
  user: { id: string; name: string; team: string | null; position: string | null; avatarColor: string };
};

type Meeting = {
  id: string;
  title: string;
  content: any;
  visibility: Visibility;
  projectId: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatarColor: string };
  project: { id: string; name: string; color: string } | null;
  viewers: Viewer[];
};

type ProjectLite = { id: string; name: string; color: string };
type UserLite = { id: string; name: string; email: string; team: string | null; position: string | null; avatarColor: string };

export default function MeetingDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [edit, setEdit] = useState<boolean>(searchParams.get("edit") === "1");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<any>(null);
  const [visibility, setVisibility] = useState<Visibility>("ALL");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [viewerIds, setViewerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);

  const [myProjects, setMyProjects] = useState<ProjectLite[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);

  // 최초 로드
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    apiSWR<{ meeting: Meeting }>(`/api/meeting/${id}`, {
      onCached: (r) => {
        if (!alive) return;
        applyMeeting(r.meeting);
        setLoading(false);
      },
      onFresh: (r) => {
        if (!alive) return;
        applyMeeting(r.meeting);
        setLoading(false);
      },
      onError: (e) => {
        if (!alive) return;
        setErr(e.message || "불러올 수 없습니다");
        setLoading(false);
      },
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function applyMeeting(m: Meeting) {
    setMeeting(m);
    setTitle(m.title);
    setContent(m.content ?? { type: "doc", content: [{ type: "paragraph" }] });
    setVisibility(m.visibility);
    setProjectId(m.projectId);
    setViewerIds(m.viewers.map((v) => v.userId));
    setErr(null);
  }

  // 수정 모드 진입 시 보조 데이터 로드 (공개 범위 설정용)
  useEffect(() => {
    if (!edit) return;
    api<{ projects: ProjectLite[] }>(user?.role === "ADMIN" ? "/api/project?all=1" : "/api/project")
      .then((r) => setMyProjects(r.projects))
      .catch(() => {});
    api<{ users: UserLite[] }>("/api/users")
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, [edit, user?.role]);

  const canEdit = useMemo(() => {
    if (!meeting || !user) return false;
    return meeting.authorId === user.id || user.role === "ADMIN";
  }, [meeting, user]);

  // 자동 저장 — 1.5초 디바운스 (저장 중이면 타이머만 다시 걸어서 race 방지)
  const saveTimerRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  useEffect(() => {
    if (!edit || !meeting || !canEdit) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      if (savingRef.current) {
        // 이미 저장 중이면 끝난 뒤 한 번 더 저장하도록 마크
        pendingRef.current = true;
        return;
      }
      doSave();
    }, 1500);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, visibility, projectId, viewerIds, edit, canEdit]);

  async function doSave() {
    if (!meeting || !canEdit) return;
    if (savingRef.current) {
      pendingRef.current = true;
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const payload: any = {
        title: title.trim() || "제목 없는 회의록",
        content,
        visibility,
        projectId: visibility === "PROJECT" ? projectId : null,
      };
      if (visibility === "SPECIFIC") payload.viewerIds = viewerIds;
      await api(`/api/meeting/${meeting.id}`, { method: "PATCH", json: payload });
      setLastSaved(Date.now());
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? "저장 실패");
    } finally {
      savingRef.current = false;
      setSaving(false);
      if (pendingRef.current) {
        pendingRef.current = false;
        // 저장하는 동안 추가 변경이 있었다면 한 번 더 저장
        void doSave();
      }
    }
  }

  const [deleting, setDeleting] = useState(false);
  async function remove() {
    if (!meeting || !canEdit || deleting) return;
    if (!confirm("이 회의록을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    try {
      await api(`/api/meeting/${meeting.id}`, { method: "DELETE" });
      nav("/meetings");
    } catch (e: any) {
      alert(e?.message ?? "삭제 실패");
      setDeleting(false);
    }
  }

  function toggleViewer(uid: string) {
    setViewerIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  }

  if (err && !meeting) {
    return (
      <div className="text-center py-16 text-slate-400">
        <div>{err}</div>
        <Link to="/meetings" className="text-brand-500 text-sm mt-2 inline-block">← 목록으로</Link>
      </div>
    );
  }
  if (!meeting && loading) return <div className="text-center py-20 text-slate-400">불러오는 중…</div>;
  if (!meeting) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <Link to="/meetings" className="text-[13px] text-slate-500 hover:text-brand-600 flex-shrink-0">
          ← 회의록 목록
        </Link>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {canEdit && !edit && (
            <button className="btn-ghost" onClick={() => { setEdit(true); setSearchParams({ edit: "1" }); }}>
              편집
            </button>
          )}
          {canEdit && edit && (
            <>
              <span className="text-[11.5px] text-slate-400">
                {saving ? "저장 중…" : lastSaved ? `저장됨 ${new Date(lastSaved).toLocaleTimeString("ko-KR")}` : ""}
              </span>
              <button className="btn-ghost" onClick={() => { setEdit(false); setSearchParams({}); }}>
                미리보기
              </button>
              <button className="btn-ghost text-danger" onClick={remove} disabled={deleting}>
                {deleting ? "삭제 중…" : "삭제"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 제목 */}
      {edit ? (
        <input
          className="w-full text-[24px] sm:text-[32px] font-extrabold bg-transparent border-none outline-none mb-2 placeholder-slate-300"
          placeholder="회의록 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
      ) : (
        <h1 className="text-[24px] sm:text-[32px] font-extrabold mb-2 break-words">{meeting.title}</h1>
      )}

      {/* 메타 정보 */}
      <div className="flex items-center gap-2 mb-5 text-[12px] text-slate-500 flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="avatar avatar-xs" style={{ background: meeting.author.avatarColor }}>
            {meeting.author.name[0]}
          </span>
          {meeting.author.name}
        </span>
        <span>·</span>
        <span>{new Date(meeting.createdAt).toLocaleString("ko-KR", { year: "numeric", month: "short", day: "numeric" })}</span>
        {meeting.project && (
          <>
            <span>·</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ background: meeting.project.color }} />
              {meeting.project.name}
            </span>
          </>
        )}
      </div>

      {/* 공개 범위 — 편집모드에서만 */}
      {edit && (
        <div className="card mb-4">
          <div className="text-[12px] font-bold mb-2">공개 범위</div>
          <div className="flex gap-2 mb-3">
            <VisBtn active={visibility === "ALL"} onClick={() => setVisibility("ALL")} label="전사" desc="로그인한 모두" />
            <VisBtn active={visibility === "PROJECT"} onClick={() => setVisibility("PROJECT")} label="프로젝트" desc="프로젝트 멤버" />
            <VisBtn active={visibility === "SPECIFIC"} onClick={() => setVisibility("SPECIFIC")} label="특정 인원" desc="지정한 사람들" />
          </div>

          {visibility === "PROJECT" && (
            <div>
              <label className="label">프로젝트 선택</label>
              <select
                className="input"
                value={projectId ?? ""}
                onChange={(e) => setProjectId(e.target.value || null)}
              >
                <option value="">프로젝트 선택…</option>
                {myProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {!projectId && <div className="text-[11px] text-danger mt-1">프로젝트를 선택해야 저장됩니다.</div>}
            </div>
          )}

          {visibility === "SPECIFIC" && (
            <ViewerPicker users={users} selected={viewerIds} onToggle={toggleViewer} authorId={meeting.authorId} />
          )}
        </div>
      )}
      {!edit && (
        <div className="mb-4 text-[12px] text-slate-500 inline-flex items-center gap-2">
          공개 범위:
          {visibility === "ALL" && <span className="chip-green">전사</span>}
          {visibility === "PROJECT" && (
            <span className="chip" style={{ background: "#DBEAFE", color: "#1E40AF" }}>
              프로젝트 — {meeting.project?.name ?? "-"}
            </span>
          )}
          {visibility === "SPECIFIC" && (
            <span className="chip" style={{ background: "#FEF3C7", color: "#92400E" }}>
              특정 {meeting.viewers.length}명 + 작성자
            </span>
          )}
        </div>
      )}

      {/* 본문 에디터 — 청크 로드 동안 부드러운 스켈레톤 */}
      <Suspense fallback={<div className="min-h-[200px] rounded-lg bg-[color:var(--c-surface-3)] animate-pulse" />}>
        <MeetingEditor
          value={content}
          onChange={(json) => setContent(json)}
          editable={edit && canEdit}
        />
      </Suspense>
    </div>
  );
}

function VisBtn({ active, onClick, label, desc }: { active: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 text-left p-3 rounded-lg border-2 transition ${active ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:bg-slate-50"}`}
    >
      <div className="text-[13px] font-bold">{label}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{desc}</div>
    </button>
  );
}

function ViewerPicker({
  users,
  selected,
  onToggle,
  authorId,
}: {
  users: UserLite[];
  selected: string[];
  onToggle: (id: string) => void;
  authorId: string;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return users
      .filter((u) => u.id !== authorId)
      .filter((u) => {
        if (!k) return true;
        return (
          u.name.toLowerCase().includes(k) ||
          u.email.toLowerCase().includes(k) ||
          (u.team ?? "").toLowerCase().includes(k) ||
          (u.position ?? "").toLowerCase().includes(k)
        );
      });
  }, [users, q, authorId]);

  return (
    <div>
      <label className="label">허용할 사람 선택 (작성자는 자동 포함)</label>
      <input
        className="input mb-2"
        placeholder="이름·팀·직급으로 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5 max-h-48 overflow-auto border border-slate-100 rounded-lg p-2">
        {filtered.map((u) => {
          const on = selected.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onToggle(u.id)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 hover:bg-slate-50 text-slate-600"}`}
            >
              <span
                className="w-5 h-5 rounded-full grid place-items-center text-white text-[10px] font-bold"
                style={{ background: u.avatarColor }}
              >
                {u.name[0]}
              </span>
              <span>{u.name}</span>
              <span className="text-[10px] text-slate-400">{u.team ?? ""}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-xs text-slate-400 py-2">해당하는 사용자가 없습니다.</div>
        )}
      </div>
      <div className="text-[11px] text-slate-500 mt-1">선택됨 {selected.length}명</div>
    </div>
  );
}
