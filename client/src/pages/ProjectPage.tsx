import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiSWR } from "../api";
import PageHeader from "../components/PageHeader";
import ProjectCalendar from "../components/ProjectCalendar";
import ProjectWebhooks from "../components/ProjectWebhooks";

type Member = {
  id: string;
  userId: string;
  role: "OWNER" | "MANAGER" | "MEMBER";
  user: { id: string; name: string; email: string; team: string | null; position: string | null; avatarColor: string };
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  status: "ACTIVE" | "ARCHIVED";
  createdBy: { id: string; name: string };
  createdAt: string;
  members: Member[];
};

/**
 * 프로젝트 상세 — 일단 뼈대만.
 * 이후 게시판/업무/파일/일정 탭이 이 위에 얹힐 예정.
 */
export default function ProjectPage() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    // stale-while-revalidate — 이전에 방문했던 프로젝트라면 캐시된 응답으로 즉시 렌더.
    // 동시에 백그라운드로 네트워크 호출이 돌아 최신값이 오면 교체.
    apiSWR<{ project: Project }>(`/api/project/${id}`, {
      onCached: (r) => {
        if (!alive) return;
        setProject(r.project);
        setErr(null);
        // 캐시 히트면 "불러오는 중" 타이틀 바로 내린다. 네트워크는 계속 돌고 있음.
        setLoading(false);
      },
      onFresh: (r) => {
        if (!alive) return;
        setProject(r.project);
        setErr(null);
        setLoading(false);
      },
      onError: (e) => {
        if (!alive) return;
        setErr(e?.message ?? "불러오지 못했습니다.");
        setLoading(false);
      },
    });
    return () => {
      alive = false;
    };
  }, [id]);

  // project 로딩이 끝나기 전에도 id 만 있으면 자식들이 fetch 를 시작하도록
  // 껍데기를 먼저 렌더한다. 이렇게 해야 /api/project/:id + events + webhook 3개가
  // 직렬이 아니라 동시에 나간다 (Render 콜드스타트 + IAD↔SIN 왕복이 직렬로 쌓이면
  // 체감 3~5초, 병렬이면 ~1초).
  if (err && !project) {
    return (
      <div className="text-center py-16 text-slate-400">
        <div>프로젝트를 찾을 수 없습니다.</div>
        <Link to="/" className="text-brand-500 text-sm mt-2 inline-block">← 홈으로</Link>
      </div>
    );
  }
  if (!id) return null;

  const members = project?.members ?? [];

  return (
    <div>
      <PageHeader
        title={
          project
            ? project.name + (project.status === "ARCHIVED" ? " (보관됨)" : "")
            : loading
              ? "불러오는 중…"
              : "프로젝트"
        }
        description={project?.description || (loading ? "" : "아직 설명이 없습니다.")}
      />

      {/* 캘린더를 전체 폭으로 사용하고, 멤버 리스트는 아래로. */}
      <div className="space-y-6">
        <div className="card">
          <ProjectCalendar
            projectId={id}
            members={members.map((m) => ({
              id: m.user.id,
              name: m.user.name,
              avatarColor: m.user.avatarColor,
              position: m.user.position,
              team: m.user.team,
            }))}
          />
        </div>

        <div className="card">
          <ProjectWebhooks projectId={id} />
        </div>

        <div className="card">
          <div className="text-sm font-bold mb-3">
            멤버 <span className="text-slate-400 font-normal">({members.length})</span>
          </div>
          {/* 가로 그리드 — 넓은 영역을 활용해 카드 형태로 나열 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 border border-slate-100 rounded-lg px-3 py-2">
                <div
                  className="avatar avatar-sm"
                  style={{ background: m.user.avatarColor }}
                  title={m.user.name}
                >
                  {m.user.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">{m.user.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {m.user.team ?? "-"} · {m.user.position ?? "-"}
                  </div>
                </div>
                {m.role !== "MEMBER" && (
                  <span className="chip bg-brand-50 text-brand-600 text-[10px]">
                    {m.role === "OWNER" ? "오너" : "매니저"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
