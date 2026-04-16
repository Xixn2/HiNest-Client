import { useEffect, useState } from "react";
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

type Log = {
  id: string;
  action: string;
  target?: string | null;
  detail?: string | null;
  ip?: string | null;
  createdAt: string;
  user?: { name: string; email: string } | null;
};

export default function AdminPage() {
  const [tab, setTab] = useState<"users" | "invites" | "logs">("users");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);

  async function load() {
    const [u, i, l] = await Promise.all([
      api<{ users: UserRow[] }>("/api/admin/users"),
      api<{ keys: Invite[] }>("/api/admin/invites"),
      api<{ logs: Log[] }>("/api/admin/logs"),
    ]);
    setUsers(u.users);
    setInvites(i.keys);
    setLogs(l.logs);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader title="관리자" description="유저, 초대키, 로그를 관리합니다." />

      <div className="flex gap-2 mb-5">
        {(
          [
            ["users", "유저 관리", users.length],
            ["invites", "초대키 발급", invites.length],
            ["logs", "로그", logs.length],
          ] as const
        ).map(([k, label, count]) => (
          <button
            key={k}
            onClick={() => setTab(k as any)}
            className={`px-4 py-2 rounded-xl text-sm font-medium ${
              tab === k ? "bg-brand-400 text-white" : "bg-white border border-slate-200 text-slate-600"
            }`}
          >
            {label} <span className="opacity-60 ml-1">{count}</span>
          </button>
        ))}
      </div>

      {tab === "users" && <UsersTab users={users} reload={load} />}
      {tab === "invites" && <InvitesTab invites={invites} reload={load} />}
      {tab === "logs" && <LogsTab logs={logs} />}
    </div>
  );
}

function UsersTab({ users, reload }: { users: UserRow[]; reload: () => void }) {
  async function update(id: string, data: any) {
    await api(`/api/admin/users/${id}`, { method: "PATCH", json: data });
    reload();
  }
  async function remove(id: string) {
    if (!confirm("정말 삭제할까요? 모든 관련 데이터가 삭제됩니다.")) return;
    await api(`/api/admin/users/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>
            <th className="text-left px-4 py-3">이름</th>
            <th className="text-left px-4 py-3">이메일</th>
            <th className="text-left px-4 py-3">직급</th>
            <th className="text-left px-4 py-3">팀</th>
            <th className="text-left px-4 py-3">권한</th>
            <th className="text-left px-4 py-3">활성</th>
            <th className="text-right px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium">{u.name}</td>
              <td className="px-4 py-2 text-slate-600">{u.email}</td>
              <td className="px-4 py-2">
                <input
                  className="input py-1 text-sm"
                  defaultValue={u.position ?? ""}
                  onBlur={(e) => e.target.value !== (u.position ?? "") && update(u.id, { position: e.target.value })}
                />
              </td>
              <td className="px-4 py-2">
                <input
                  className="input py-1 text-sm"
                  defaultValue={u.team ?? ""}
                  onBlur={(e) => e.target.value !== (u.team ?? "") && update(u.id, { team: e.target.value })}
                />
              </td>
              <td className="px-4 py-2">
                <select
                  className="input py-1 text-sm"
                  value={u.role}
                  onChange={(e) => update(u.id, { role: e.target.value })}
                >
                  <option value="MEMBER">MEMBER</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </td>
              <td className="px-4 py-2">
                <button
                  className={`chip ${u.active ? "bg-brand-100 text-brand-700" : "bg-slate-200 text-slate-500"}`}
                  onClick={() => update(u.id, { active: !u.active })}
                >
                  {u.active ? "활성" : "비활성"}
                </button>
              </td>
              <td className="px-4 py-2 text-right">
                <button className="text-xs text-rose-500" onClick={() => remove(u.id)}>
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvitesTab({ invites, reload }: { invites: Invite[]; reload: () => void }) {
  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "MEMBER",
    team: "",
    position: "",
    expiresInDays: 7,
  });
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await api<{ key: Invite }>("/api/admin/invites", {
      method: "POST",
      json: {
        ...form,
        expiresInDays: Number(form.expiresInDays) || undefined,
      },
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

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="card">
        <h3 className="text-lg font-bold mb-4">새 초대키 발급</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">이름 (선택)</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">이메일 (선택, 고정)</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">권한</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="MEMBER">MEMBER</option>
              <option value="MANAGER">MANAGER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">팀</label>
              <input className="input" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
            </div>
            <div>
              <label className="label">직급</label>
              <input className="input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">만료일 (일)</label>
            <input type="number" className="input" value={form.expiresInDays} onChange={(e) => setForm({ ...form, expiresInDays: Number(e.target.value) })} />
          </div>
          <button className="btn-primary w-full">발급하기</button>
        </form>
        {createdKey && (
          <div className="mt-4 p-3 rounded-xl bg-brand-50 border border-brand-200">
            <div className="text-xs text-brand-700 mb-1">새 초대키 (복사해 전달하세요)</div>
            <div className="font-mono text-sm break-all">{createdKey}</div>
            <button
              className="btn-ghost mt-2 w-full text-xs"
              onClick={() => {
                navigator.clipboard.writeText(createdKey);
                alert("복사되었습니다.");
              }}
            >
              복사
            </button>
          </div>
        )}
      </div>

      <div className="col-span-2 card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100 text-sm font-bold">초대키 목록</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-left px-4 py-3">키</th>
              <th className="text-left px-4 py-3">대상</th>
              <th className="text-left px-4 py-3">권한/팀/직급</th>
              <th className="text-left px-4 py-3">상태</th>
              <th className="text-right px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {invites.map((k) => (
              <tr key={k.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">
                  <span className="mr-2">{k.key}</span>
                  <button
                    className="text-[11px] text-brand-600"
                    onClick={() => {
                      navigator.clipboard.writeText(k.key);
                    }}
                  >
                    복사
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{k.name ?? "-"}</div>
                  <div className="text-xs text-slate-500">{k.email ?? "이메일 제한 없음"}</div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {k.role} / {k.team ?? "-"} / {k.position ?? "-"}
                </td>
                <td className="px-4 py-3">
                  {k.used ? (
                    <div>
                      <span className="chip bg-slate-200 text-slate-600">사용완료</span>
                      {k.usedBy && <div className="text-xs text-slate-500 mt-1">{k.usedBy.name} ({k.usedBy.email})</div>}
                    </div>
                  ) : k.expiresAt && new Date(k.expiresAt) < new Date() ? (
                    <span className="chip bg-rose-100 text-rose-600">만료</span>
                  ) : (
                    <span className="chip bg-brand-100 text-brand-700">사용 가능</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button className="text-xs text-rose-500" onClick={() => remove(k.id)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {invites.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  발급된 초대키가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogsTab({ logs }: { logs: Log[] }) {
  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>
            <th className="text-left px-4 py-3">시각</th>
            <th className="text-left px-4 py-3">사용자</th>
            <th className="text-left px-4 py-3">액션</th>
            <th className="text-left px-4 py-3">대상</th>
            <th className="text-left px-4 py-3">상세</th>
            <th className="text-left px-4 py-3">IP</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-t border-slate-100">
              <td className="px-4 py-2 text-xs text-slate-500">{new Date(l.createdAt).toLocaleString("ko-KR")}</td>
              <td className="px-4 py-2">{l.user?.name ?? "-"}</td>
              <td className="px-4 py-2">
                <span className="chip bg-slate-100 text-slate-700">{l.action}</span>
              </td>
              <td className="px-4 py-2 text-xs text-slate-600">{l.target ?? "-"}</td>
              <td className="px-4 py-2 text-xs text-slate-500 max-w-[280px] truncate">{l.detail ?? "-"}</td>
              <td className="px-4 py-2 text-xs text-slate-500">{l.ip ?? "-"}</td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                로그가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
