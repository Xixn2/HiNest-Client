import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import PageHeader from "../components/PageHeader";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  team?: string | null;
  position?: string | null;
  active: boolean;
  avatarColor?: string;
  createdAt: string;
};
type Invite = {
  id: string;
  key: string;
  email?: string | null;
  name?: string | null;
  role: string;
  team?: string | null;
  position?: string | null;
  used: boolean;
  usedAt?: string | null;
  usedBy?: { name: string; email: string } | null;
  expiresAt?: string | null;
  createdAt: string;
};
type Team = { id: string; name: string; createdAt: string };
type Position = { id: string; name: string; rank: number; createdAt: string };

type Tab = "users" | "invites" | "teams" | "positions";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);

  async function loadCommon() {
    const [u, i, t, p] = await Promise.all([
      api<{ users: UserRow[] }>("/api/admin/users"),
      api<{ keys: Invite[] }>("/api/admin/invites"),
      api<{ teams: Team[] }>("/api/admin/teams"),
      api<{ positions: Position[] }>("/api/admin/positions"),
    ]);
    setUsers(u.users);
    setInvites(i.keys);
    setTeams(t.teams);
    setPositions(p.positions);
  }

  useEffect(() => { loadCommon(); }, []);

  const TABS: { key: Tab; label: string; count: number; icon: JSX.Element }[] = [
    { key: "users", label: "구성원", count: users.length, icon: <UsersIcon /> },
    { key: "invites", label: "초대키", count: invites.filter((k) => !k.used).length, icon: <KeyIcon /> },
    { key: "teams", label: "팀", count: teams.length, icon: <TeamIcon /> },
    { key: "positions", label: "직급", count: positions.length, icon: <RankIcon /> },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="관리"
        title="관리자"
        description="구성원·초대키·팀·직급을 관리합니다."
      />

      {/* 통계 스트립 */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatCard label="전체 구성원" value={users.length} sub={`활성 ${users.filter((u) => u.active).length}명`} />
        <StatCard label="미사용 초대키" value={invites.filter((k) => !k.used).length} sub={`총 ${invites.length}건 발급`} />
        <StatCard label="팀" value={teams.length} sub="전사 팀 수" />
        <StatCard label="직급" value={positions.length} sub="전사 직급 수" />
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-1 mb-5 border-b border-ink-150">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`group relative inline-flex items-center gap-2 px-4 h-[40px] text-[13px] font-bold transition ${
              tab === t.key ? "text-ink-900" : "text-ink-500 hover:text-ink-800"
            }`}
          >
            <span className={tab === t.key ? "text-brand-500" : "text-ink-400 group-hover:text-ink-600"}>{t.icon}</span>
            {t.label}
            <span className="ml-0.5 text-[11px] text-ink-400 tabular font-semibold">{t.count}</span>
            {tab === t.key && (
              <span className="absolute -bottom-px left-2 right-2 h-[2px] bg-brand-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab users={users} teams={teams} positions={positions} reload={loadCommon} />}
      {tab === "invites" && <InvitesTab invites={invites} teams={teams} positions={positions} reload={loadCommon} />}
      {tab === "teams" && <TeamsTab teams={teams} reload={loadCommon} />}
      {tab === "positions" && <PositionsTab positions={positions} reload={loadCommon} />}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] font-bold text-ink-500 uppercase tracking-[0.06em]">{label}</div>
      <div className="text-[26px] font-extrabold text-ink-900 mt-1.5 tabular" style={{ letterSpacing: "-0.03em" }}>
        {value.toLocaleString()}
      </div>
      <div className="text-[11px] text-ink-500 mt-0.5">{sub}</div>
    </div>
  );
}

/* ===================== Users ===================== */
function UsersTab({
  users, teams, positions, reload,
}: { users: UserRow[]; teams: Team[]; positions: Position[]; reload: () => void }) {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  async function update(id: string, data: any) {
    await api(`/api/admin/users/${id}`, { method: "PATCH", json: data });
    reload();
  }
  async function remove(id: string) {
    if (!confirm("정말 삭제할까요? 모든 관련 데이터가 삭제됩니다.")) return;
    await api(`/api/admin/users/${id}`, { method: "DELETE" });
    reload();
  }

  const filtered = useMemo(() => {
    let arr = users;
    if (roleFilter) arr = arr.filter((u) => u.role === roleFilter);
    if (activeFilter === "active") arr = arr.filter((u) => u.active);
    if (activeFilter === "inactive") arr = arr.filter((u) => !u.active);
    const k = q.trim().toLowerCase();
    if (k) arr = arr.filter((u) =>
      u.name.toLowerCase().includes(k) ||
      u.email.toLowerCase().includes(k) ||
      (u.team ?? "").toLowerCase().includes(k) ||
      (u.position ?? "").toLowerCase().includes(k)
    );
    return arr;
  }, [users, q, roleFilter, activeFilter]);

  return (
    <div className="panel p-0 overflow-hidden">
      <div className="section-head">
        <div className="title">구성원 목록 <span className="text-ink-400 font-medium tabular ml-1">{filtered.length}</span></div>
        <div className="flex items-center gap-2">
          <input className="input text-[12px] h-[32px] w-[200px]" placeholder="이름·이메일·팀 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input text-[12px] h-[32px] w-[120px]" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">모든 권한</option>
            <option value="ADMIN">ADMIN</option>
            <option value="MANAGER">MANAGER</option>
            <option value="MEMBER">MEMBER</option>
          </select>
          <div className="tabs">
            {(["all", "active", "inactive"] as const).map((v) => (
              <button key={v} onClick={() => setActiveFilter(v)} className={`tab ${activeFilter === v ? "tab-active" : ""}`}>
                {v === "all" ? "전체" : v === "active" ? "활성" : "비활성"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <table className="pro">
        <thead>
          <tr>
            <th style={{ width: "26%" }}>이름</th>
            <th style={{ width: "18%" }}>ID / 이메일</th>
            <th style={{ width: "14%" }}>직급</th>
            <th style={{ width: "14%" }}>팀</th>
            <th style={{ width: "10%" }}>권한</th>
            <th style={{ width: "10%" }}>상태</th>
            <th style={{ width: "8%", textAlign: "right" }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.id}>
              <td>
                <div className="flex items-center gap-3">
                  <UserAvatar name={u.name} color={u.avatarColor ?? "#3D54C4"} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-ink-900 truncate">{u.name}</div>
                    <div className="text-[11px] text-ink-500 tabular">가입 {new Date(u.createdAt).toLocaleDateString("ko-KR")}</div>
                  </div>
                </div>
              </td>
              <td className="tabular text-[12px] text-ink-600">{u.email}</td>
              <td>
                <select className="input text-[12px] h-[30px]" value={u.position ?? ""} onChange={(e) => update(u.id, { position: e.target.value || null })}>
                  <option value="">—</option>
                  {positions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  {u.position && !positions.find((p) => p.name === u.position) && (
                    <option value={u.position}>{u.position} (사용안함)</option>
                  )}
                </select>
              </td>
              <td>
                <select className="input text-[12px] h-[30px]" value={u.team ?? ""} onChange={(e) => update(u.id, { team: e.target.value || null })}>
                  <option value="">—</option>
                  {teams.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                  {u.team && !teams.find((t) => t.name === u.team) && (
                    <option value={u.team}>{u.team} (사용안함)</option>
                  )}
                </select>
              </td>
              <td>
                <select className="input text-[12px] h-[30px]" value={u.role} onChange={(e) => update(u.id, { role: e.target.value })}>
                  <option value="MEMBER">MEMBER</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </td>
              <td>
                <button onClick={() => update(u.id, { active: !u.active })} className={u.active ? "chip-green" : "chip-gray"}>
                  <span className="badge-dot" style={{ background: u.active ? "#16A34A" : "#8E959E" }} />
                  {u.active ? "Active" : "Inactive"}
                </button>
              </td>
              <td style={{ textAlign: "right" }}>
                <button className="btn-icon" title="삭제" onClick={() => remove(u.id)}>
                  <TrashIcon />
                </button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState title="구성원이 없습니다" description="초대키를 발급해 팀원을 추가해보세요." />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function UserAvatar({ name, color }: { name: string; color: string }) {
  return (
    <div className="w-9 h-9 rounded-full grid place-items-center text-white text-[13px] font-extrabold flex-shrink-0"
      style={{ background: color, letterSpacing: "-0.02em" }}>
      {name?.[0] ?? "?"}
    </div>
  );
}

/* ===================== Invites ===================== */
function InvitesTab({
  invites, teams, positions, reload,
}: { invites: Invite[]; teams: Team[]; positions: Position[]; reload: () => void }) {
  const [form, setForm] = useState({
    email: "", name: "", role: "MEMBER", team: "", position: "", expiresInDays: 7,
  });
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await api<{ key: Invite }>("/api/admin/invites", {
      method: "POST",
      json: { ...form, expiresInDays: Number(form.expiresInDays) || undefined },
    });
    setCreatedKey(res.key.key);
    setForm({ email: "", name: "", role: "MEMBER", team: "", position: "", expiresInDays: 7 });
    reload();
  }

  async function remove(id: string) {
    if (!confirm("초대키를 삭제할까요?")) return;
    await api(`/api/admin/invites/${id}`, { method: "DELETE" });
    reload();
  }

  function copy(k: string) {
    navigator.clipboard.writeText(k);
    setCreatedKey(k);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      {/* 발급 폼 */}
      <div className="col-span-2 panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 grid place-items-center">
            <KeyIcon />
          </div>
          <div>
            <div className="h-sub">새 초대키 발급</div>
            <div className="t-caption">입사자에게 전달해 가입시키세요.</div>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">이름</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="홍길동" />
            </div>
            <div>
              <label className="field-label">권한</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="MEMBER">MEMBER</option>
                <option value="MANAGER">MANAGER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">이메일 / 사내 ID <span className="text-ink-500 font-normal">(선택 · 고정)</span></label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">팀</label>
              <select className="input" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}>
                <option value="">—</option>
                {teams.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">직급</label>
              <select className="input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
                <option value="">—</option>
                {positions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">만료 (일)</label>
            <input type="number" className="input" value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: Number(e.target.value) })} />
          </div>
          <button className="btn-primary btn-lg w-full">초대키 발급하기</button>
        </form>

        {createdKey && (
          <div className="mt-5 p-4 rounded-xl border-2 border-brand-200 bg-brand-50">
            <div className="text-[11px] font-extrabold text-brand-700 uppercase tracking-[0.08em] mb-2">새 초대키</div>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-[14px] font-bold break-all text-ink-900">{createdKey}</div>
              <button className="btn-primary btn-xs" onClick={() => copy(createdKey)}>
                {copied ? "✓ 복사됨" : "복사"}
              </button>
            </div>
            <div className="text-[11px] text-brand-700 mt-2">이 키를 받은 사람만 /signup 에서 가입할 수 있어요.</div>
          </div>
        )}
      </div>

      {/* 목록 */}
      <div className="col-span-3 panel p-0 overflow-hidden">
        <div className="section-head">
          <div className="title">초대키 목록 <span className="text-ink-400 font-medium tabular ml-1">{invites.length}</span></div>
        </div>
        <table className="pro">
          <thead>
            <tr>
              <th>키</th>
              <th>대상</th>
              <th>권한 · 팀 · 직급</th>
              <th>상태</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((k) => {
              const expired = !k.used && k.expiresAt && new Date(k.expiresAt) < new Date();
              return (
                <tr key={k.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <button onClick={() => copy(k.key)} className="font-mono text-[12px] font-bold text-ink-900 hover:text-brand-600" title="클릭하여 복사">
                        {k.key}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="text-[13px] font-bold text-ink-900">{k.name ?? "—"}</div>
                    <div className="text-[11px] text-ink-500 truncate tabular">{k.email ?? "이메일 제한 없음"}</div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="chip-gray">{k.role}</span>
                      {k.team && <span className="chip-blue">{k.team}</span>}
                      {k.position && <span className="chip-brand">{k.position}</span>}
                    </div>
                  </td>
                  <td>
                    {k.used ? (
                      <div>
                        <span className="chip-gray">사용완료</span>
                        {k.usedBy && <div className="text-[11px] text-ink-500 mt-1">{k.usedBy.name}</div>}
                      </div>
                    ) : expired ? (
                      <span className="chip-red">만료</span>
                    ) : (
                      <span className="chip-green">
                        <span className="badge-dot" style={{ background: "#16A34A" }} /> Active
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn-icon" title="삭제" onClick={() => remove(k.id)}>
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              );
            })}
            {invites.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState title="발급된 초대키가 없어요" description="좌측에서 새 초대키를 발급해보세요." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ===================== Teams ===================== */
function TeamsTab({ teams, reload }: { teams: Team[]; reload: () => void }) {
  const [name, setName] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api("/api/admin/teams", { method: "POST", json: { name: name.trim() } });
      setName("");
      reload();
    } catch (e: any) { alert(e.message); }
  }
  async function rename(t: Team) {
    const n = prompt("새 이름", t.name);
    if (!n || n === t.name) return;
    try {
      await api(`/api/admin/teams/${t.id}`, { method: "PATCH", json: { name: n.trim() } });
      reload();
    } catch (e: any) { alert(e.message); }
  }
  async function remove(t: Team) {
    if (!confirm(`'${t.name}' 팀을 삭제할까요?`)) return;
    await api(`/api/admin/teams/${t.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      <div className="col-span-2 panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 grid place-items-center">
            <TeamIcon />
          </div>
          <div>
            <div className="h-sub">새 팀 생성</div>
            <div className="t-caption">전사 조직 단위를 관리합니다.</div>
          </div>
        </div>
        <form onSubmit={add} className="space-y-3">
          <div>
            <label className="field-label">팀 이름</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 개발, 디자인, 경영지원" />
          </div>
          <button className="btn-primary btn-lg w-full">팀 생성</button>
        </form>
      </div>

      <div className="col-span-3 panel p-0 overflow-hidden">
        <div className="section-head">
          <div className="title">팀 목록 <span className="text-ink-400 font-medium tabular ml-1">{teams.length}</span></div>
        </div>
        <div className="divide-y divide-ink-100">
          {teams.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-ink-25">
              <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-700 grid place-items-center text-[13px] font-extrabold">
                {t.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-ink-900">{t.name}</div>
                <div className="text-[11px] text-ink-500 tabular">생성 {new Date(t.createdAt).toLocaleDateString("ko-KR")}</div>
              </div>
              <button className="btn-ghost btn-xs" onClick={() => rename(t)}>이름 변경</button>
              <button className="btn-icon" title="삭제" onClick={() => remove(t)}>
                <TrashIcon />
              </button>
            </div>
          ))}
          {teams.length === 0 && <EmptyState title="생성된 팀이 없어요" description="좌측에서 첫 팀을 만들어보세요." />}
        </div>
      </div>
    </div>
  );
}

/* ===================== Positions ===================== */
function PositionsTab({ positions, reload }: { positions: Position[]; reload: () => void }) {
  const [form, setForm] = useState({ name: "", rank: 0 });
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await api("/api/admin/positions", { method: "POST", json: { name: form.name.trim(), rank: Number(form.rank) || 0 } });
      setForm({ name: "", rank: 0 });
      reload();
    } catch (e: any) { alert(e.message); }
  }
  async function update(p: Position, data: any) {
    await api(`/api/admin/positions/${p.id}`, { method: "PATCH", json: data });
    reload();
  }
  async function remove(p: Position) {
    if (!confirm(`'${p.name}' 직급을 삭제할까요?`)) return;
    await api(`/api/admin/positions/${p.id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="grid grid-cols-5 gap-4">
      <div className="col-span-2 panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 grid place-items-center">
            <RankIcon />
          </div>
          <div>
            <div className="h-sub">새 직급 생성</div>
            <div className="t-caption">직급은 순서값이 작을수록 위에 표시됩니다.</div>
          </div>
        </div>
        <form onSubmit={add} className="space-y-3">
          <div>
            <label className="field-label">직급명</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 사원, 대리, 과장, 팀장, 이사" />
          </div>
          <div>
            <label className="field-label">순서값 <span className="text-ink-500 font-normal">(작을수록 상위)</span></label>
            <input type="number" className="input" value={form.rank} onChange={(e) => setForm({ ...form, rank: Number(e.target.value) })} />
          </div>
          <button className="btn-primary btn-lg w-full">직급 생성</button>
        </form>
      </div>

      <div className="col-span-3 panel p-0 overflow-hidden">
        <div className="section-head">
          <div className="title">직급 목록 <span className="text-ink-400 font-medium tabular ml-1">{positions.length}</span></div>
        </div>
        <div className="divide-y divide-ink-100">
          {positions.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-ink-25">
              <input
                type="number"
                className="input text-[12px] h-[32px] w-[56px] tabular text-center"
                defaultValue={p.rank}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== p.rank) update(p, { rank: v });
                }}
              />
              <input
                className="input text-[13px] h-[32px] font-bold flex-1"
                defaultValue={p.name}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== p.name) update(p, { name: e.target.value.trim() });
                }}
              />
              <div className="text-[11px] text-ink-500 tabular w-[88px] text-right">
                {new Date(p.createdAt).toLocaleDateString("ko-KR")}
              </div>
              <button className="btn-icon" title="삭제" onClick={() => remove(p)}>
                <TrashIcon />
              </button>
            </div>
          ))}
          {positions.length === 0 && <EmptyState title="생성된 직급이 없어요" description="좌측에서 첫 직급을 만들어보세요." />}
        </div>
      </div>
    </div>
  );
}

/* ===================== Shared ===================== */
function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="py-14 text-center">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-ink-100 grid place-items-center mb-3">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8E959E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7h18M3 12h18M3 17h10" />
        </svg>
      </div>
      <div className="text-[13px] font-bold text-ink-800">{title}</div>
      <div className="text-[12px] text-ink-500 mt-1">{description}</div>
    </div>
  );
}

/* Icons */
function UsersIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>;
}
function KeyIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="15.5" r="4.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" />
  </svg>;
}
function TeamIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M10 4v16" />
  </svg>;
}
function RankIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9 12 3l6 6" /><path d="M12 3v18" /><path d="M6 15l6 6 6-6" />
  </svg>;
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>;
}
