import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiSWR, invalidateCache } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";
import { alertAsync } from "../components/ConfirmHost";

type MeetingRow = {
  id: string;
  title: string;
  visibility: "ALL" | "PROJECT" | "SPECIFIC";
  projectId: string | null;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  author: { id: string; name: string; avatarColor: string };
  project: { id: string; name: string; color: string } | null;
};

/** 회의록 목록 + 새로 만들기. */
export default function MeetingsPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "mine" | "ALL" | "PROJECT" | "SPECIFIC">("all");

  useEffect(() => {
    let alive = true;
    apiSWR<{ meetings: MeetingRow[] }>("/api/meeting", {
      onCached: (r) => {
        if (!alive) return;
        setRows(r.meetings);
        setLoading(false);
      },
      onFresh: (r) => {
        if (!alive) return;
        setRows(r.meetings);
        setLoading(false);
      },
      onError: () => alive && setLoading(false),
    });
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    let arr = rows;
    if (visibilityFilter === "mine") arr = arr.filter((m) => m.authorId === user?.id);
    else if (visibilityFilter !== "all") arr = arr.filter((m) => m.visibility === visibilityFilter);
    const k = q.trim().toLowerCase();
    if (k) arr = arr.filter((m) => m.title.toLowerCase().includes(k) || m.author.name.toLowerCase().includes(k));
    return arr;
  }, [rows, q, visibilityFilter, user?.id]);

  async function createNew() {
    if (creating) return;
    setCreating(true);
    try {
      const r = await api<{ meeting: { id: string } }>("/api/meeting", {
        method: "POST",
        json: {
          title: "제목 없는 회의록",
          content: { type: "doc", content: [{ type: "paragraph" }] },
          visibility: "ALL",
        },
      });
      // 목록 캐시를 비워 — 새 회의록을 저장 후 뒤로 돌아왔을 때 stale cache 로 인해
      // 방금 만든 항목이 안 보이는 flash 를 방지.
      invalidateCache("/api/meeting");
      nav(`/meetings/${r.meeting.id}?edit=1`);
    } catch (e: any) {
      alertAsync({ title: "생성 실패", description: e?.message ?? "회의록 생성 실패" });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader title="회의록" description="노션처럼 서식을 넣어 작성하고, 공개 범위를 세밀하게 지정하세요." />

      <div className="card">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="제목·작성자로 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={80}
          />
          <select
            className="input w-[140px]"
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value as any)}
          >
            <option value="all">전체 보기</option>
            <option value="mine">내가 쓴 것</option>
            <option value="ALL">공개 범위: 전사</option>
            <option value="PROJECT">공개 범위: 프로젝트</option>
            <option value="SPECIFIC">공개 범위: 특정 인원</option>
          </select>
          <button className="btn-primary" onClick={createNew} disabled={creating}>
            {creating ? "생성 중…" : "+ 새 회의록"}
          </button>
        </div>

        <div className="space-y-1.5">
          {filtered.map((m) => (
            <Link
              key={m.id}
              to={`/meetings/${m.id}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition"
            >
              <div className="w-10 h-10 rounded-lg grid place-items-center flex-shrink-0" style={{ background: m.project?.color ?? "#CBD5E1", color: "#fff" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="8" y1="13" x2="16" y2="13" />
                  <line x1="8" y1="17" x2="13" y2="17" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold truncate">{m.title || "제목 없음"}</div>
                <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-slate-500">
                  <span>{m.author.name}</span>
                  <span>·</span>
                  <span>{new Date(m.updatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  {m.project && (
                    <>
                      <span>·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.project.color }} />
                        {m.project.name}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <VisibilityBadge v={m.visibility} />
            </Link>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">
              {q || visibilityFilter !== "all" ? "해당하는 회의록이 없습니다." : "첫 회의록을 만들어보세요."}
            </div>
          )}
          {loading && <div className="text-center py-10 text-slate-400 text-sm">불러오는 중…</div>}
        </div>
      </div>
    </div>
  );
}

function VisibilityBadge({ v }: { v: "ALL" | "PROJECT" | "SPECIFIC" }) {
  const styles: Record<typeof v, { bg: string; fg: string; label: string }> = {
    ALL: { bg: "#DCFCE7", fg: "#166534", label: "전사" },
    PROJECT: { bg: "#DBEAFE", fg: "#1E40AF", label: "프로젝트" },
    SPECIFIC: { bg: "#FEF3C7", fg: "#92400E", label: "특정 인원" },
  };
  const s = styles[v];
  return (
    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: s.bg, color: s.fg }}>
      {s.label}
    </span>
  );
}
