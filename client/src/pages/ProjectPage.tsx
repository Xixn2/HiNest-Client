import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../api";
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
    api<{ project: Project }>(`/api/project/${id}`)
      .then((r) => {
        if (!alive) return;
        setProject(r.project);
        setErr(null);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "불러오지 못했습니다.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return <div className="text-slate-400 text-sm py-10 text-center">불러오는 중…</div>;
  }
  if (err || !project) {
    return (
      <div className="text-center py-16 text-slate-400">
        <div>프로젝트를 찾을 수 없습니다.</div>
        <Link to="/" className="text-brand-500 text-sm mt-2 inline-block">← 홈으로</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={project.name + (project.status === "ARCHIVED" ? " (보관됨)" : "")}
        description={project.description || "아직 설명이 없습니다."}
      />

      {/* 캘린더를 전체 폭으로 사용하고, 멤버 리스트는 아래로. */}
      <div className="space-y-6">
        <div className="card">
          <ProjectCalendar
            projectId={project.id}
            members={project.members.map((m) => ({
              id: m.user.id,
              name: m.user.name,
              avatarColor: m.user.avatarColor,
              position: m.user.position,
              team: m.user.team,
            }))}
          />
        </div>

        <div className="card">
          <ProjectWebhooks projectId={project.id} />
        </div>

        <div className="card">
          <div className="text-sm font-bold mb-3">
            멤버 <span className="text-slate-400 font-normal">({project.members.length})</span>
          </div>
          {/* 가로 그리드 — 넓은 영역을 활용해 카드 형태로 나열 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {project.members.map((m) => (
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
