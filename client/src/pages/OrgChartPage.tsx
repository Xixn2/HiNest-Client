import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";

type DirUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  team?: string | null;
  position?: string | null;
  avatarColor?: string;
};
type Position = { id: string; name: string; rank: number };

// 직급 키워드 순위 (직급 데이터가 없을 때 fallback)
const RANK_HINTS = ["이사", "부장", "팀장", "과장", "대리", "사원"];

export default function OrgChartPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<DirUser[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);

  async function load() {
    const [u, p] = await Promise.all([
      api<{ users: DirUser[] }>("/api/users"),
      api<{ teams: string[] }>("/api/users/teams").catch(() => ({ teams: [] })),
    ]);
    setUsers(u.users);
    void p;
  }

  async function loadPositions() {
    // 직급 등록된 리스트를 가져오려면 관리자 API 필요. 일반 유저는 hint 만 사용.
    try {
      const r = await api<{ positions: Position[] }>("/api/admin/positions");
      setPositions(r.positions);
    } catch {}
  }

  useEffect(() => {
    load();
    loadPositions();
  }, []);

  const rank = useMemo(() => {
    const map = new Map<string, number>();
    positions.forEach((p) => map.set(p.name, p.rank));
    return (name?: string | null) => {
      if (!name) return 999;
      if (map.has(name)) return map.get(name)!;
      const idx = RANK_HINTS.findIndex((k) => name.includes(k));
      return idx === -1 ? 500 : idx;
    };
  }, [positions]);

  // 팀별 그룹 + 직급순 정렬
  const grouped = useMemo(() => {
    const map = new Map<string, DirUser[]>();
    for (const u of users) {
      const t = u.team ?? "소속 없음";
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(u);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => rank(a.position) - rank(b.position) || a.name.localeCompare(b.name, "ko"));
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "ko"));
  }, [users, rank]);

  async function startDM(target: DirUser) {
    if (target.id === user?.id) return;
    const res = await api<{ room: { id: string } }>("/api/chat/rooms", {
      method: "POST",
      json: { type: "DIRECT", memberIds: [target.id] },
    });
    window.dispatchEvent(new CustomEvent("chat:open"));
    window.dispatchEvent(new CustomEvent("chat:open-room", { detail: { roomId: res.room.id } }));
  }

  return (
    <div>
      <PageHeader
        eyebrow="조직"
        title="조직도"
        description={`총 ${users.length}명 · ${grouped.length}개 팀 · 직급순 배열`}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {grouped.map(([team, members]) => (
          <div key={team} className="panel p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-ink-150 bg-gradient-to-r from-brand-50 to-white">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-brand-500 text-white grid place-items-center text-[13px] font-extrabold">
                  {team[0]}
                </div>
                <div>
                  <div className="text-[14px] font-extrabold text-ink-900 tracking-tight">{team}</div>
                  <div className="text-[11px] text-ink-500 tabular">{members.length}명</div>
                </div>
              </div>
            </div>
            <div className="divide-y divide-ink-100">
              {members.map((u) => (
                <div key={u.id} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-ink-25">
                  <div className="w-9 h-9 rounded-full grid place-items-center text-white text-[13px] font-extrabold flex-shrink-0"
                    style={{ background: u.avatarColor ?? "#3D54C4", letterSpacing: "-0.02em" }}>
                    {u.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-ink-900 truncate">{u.name}{u.id === user?.id && <span className="chip-gray ml-1.5">나</span>}</div>
                    <div className="text-[11px] text-ink-500 truncate">{u.position ?? "—"}</div>
                  </div>
                  {u.id !== user?.id && (
                    <button
                      onClick={() => startDM(u)}
                      className="md:opacity-0 md:group-hover:opacity-100 btn-icon"
                      title="1:1 대화"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 5h16v11H9l-4 4z" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <div className="col-span-3 panel py-14 text-center">
            <div className="text-[13px] font-bold text-ink-800">팀이 없어요</div>
            <div className="text-[12px] text-ink-500 mt-1">관리자 페이지에서 팀을 추가하세요.</div>
          </div>
        )}
      </div>
    </div>
  );
}
