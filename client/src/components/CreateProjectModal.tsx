import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

type UserLite = {
  id: string;
  name: string;
  email: string;
  team: string | null;
  position: string | null;
  avatarColor: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** 생성 후 사이드바 프로젝트 목록을 다시 가져오도록 호출됨. */
  onCreated?: () => void;
};

const PALETTE = [
  "#3B5CF0",
  "#7B5CF0",
  "#16A34A",
  "#F59E0B",
  "#EF4444",
  "#06B6D4",
  "#DB2777",
  "#64748B",
];

export default function CreateProjectModal({ open, onClose, onCreated }: Props) {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PALETTE[0]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // 열릴 때마다 상태 초기화.
    setName("");
    setDescription("");
    setColor(PALETTE[0]);
    setMemberIds([]);
    setQ("");
    setErr(null);
    api<{ users: UserLite[] }>("/api/user")
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const filtered = users.filter((u) => {
    const k = q.trim().toLowerCase();
    if (!k) return true;
    return (
      u.name.toLowerCase().includes(k) ||
      u.email.toLowerCase().includes(k) ||
      (u.team ?? "").toLowerCase().includes(k) ||
      (u.position ?? "").toLowerCase().includes(k)
    );
  });

  function toggleMember(id: string) {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ project: { id: string } }>("/api/project", {
        method: "POST",
        json: {
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          memberIds,
        },
      });
      onCreated?.();
      onClose();
      // 만든 직후 바로 해당 프로젝트로 이동.
      nav(`/projects/${r.project.id}`);
    } catch (e: any) {
      setErr(e?.message ?? "프로젝트 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/40 grid place-items-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">새 프로젝트</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">이름</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">설명</label>
            <textarea
              className="input"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
            />
          </div>
          <div>
            <label className="label">색상</label>
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 ${color === c ? "border-slate-900" : "border-transparent"}`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="label">멤버</label>
            <input
              className="input mb-2"
              placeholder="이름·팀·직급으로 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-auto border border-slate-100 rounded-lg p-2">
              {filtered.map((u) => {
                const on = memberIds.includes(u.id);
                return (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => toggleMember(u.id)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full border text-xs ${on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 hover:bg-slate-50 text-slate-600"}`}
                  >
                    <span
                      className="w-5 h-5 rounded-full grid place-items-center text-white text-[10px] font-bold"
                      style={{ background: u.avatarColor }}
                    >
                      {u.name[0]}
                    </span>
                    <span>{u.name}</span>
                    <span className="text-[10px] text-slate-400">
                      {u.team ?? ""}
                    </span>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="text-xs text-slate-400 py-2">
                  해당하는 사용자가 없습니다.
                </div>
              )}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              선택된 멤버 {memberIds.length}명 — 생성자는 자동으로 오너로 포함됩니다.
            </div>
          </div>
          {err && <div className="text-xs text-danger">{err}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              취소
            </button>
            <button className="btn-primary" disabled={busy}>
              {busy ? "생성 중…" : "만들기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
