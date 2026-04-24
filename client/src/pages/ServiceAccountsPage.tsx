import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";
import { confirmAsync, alertAsync } from "../components/ConfirmHost";

/**
 * 서비스 계정 레지스트리 — 회사에서 쓰는 AWS/Vercel/GitHub/테스트 계정을 한 곳에 모으는 페이지.
 *
 * 보안 원칙:
 * - 비밀번호/토큰/액세스키는 저장하지 않는다. 전용 비밀번호 관리자(1Password 등) 사용 전제.
 * - 이 페이지의 목적은 "어떤 서비스의 계정을 누가 담당하는지" 인덱스.
 *
 * 편집 권한: 작성자 본인 또는 ADMIN.
 */

type Category = "CLOUD" | "HOSTING" | "VCS" | "PAYMENT" | "DOMAIN" | "EMAIL" | "MONITOR" | "DB" | "AI" | "TESTING" | "OTHER";

const CATEGORY_META: Record<Category, { label: string; color: string; emoji: string }> = {
  CLOUD:    { label: "클라우드", color: "#F59E0B", emoji: "☁️" },
  HOSTING:  { label: "호스팅",   color: "#000000", emoji: "▲" },
  VCS:      { label: "저장소",   color: "#24292F", emoji: "🐙" },
  PAYMENT:  { label: "결제",     color: "#635BFF", emoji: "💳" },
  DOMAIN:   { label: "도메인",   color: "#F38020", emoji: "🌐" },
  EMAIL:    { label: "이메일",   color: "#EA4335", emoji: "✉️" },
  MONITOR:  { label: "모니터링", color: "#7B3FE4", emoji: "📡" },
  DB:       { label: "데이터베이스", color: "#336791", emoji: "🗄️" },
  AI:       { label: "AI",       color: "#10A37F", emoji: "🤖" },
  TESTING:  { label: "테스트",   color: "#16A34A", emoji: "🧪" },
  OTHER:    { label: "기타",     color: "#6B7280", emoji: "📦" },
};
const CATEGORY_ORDER: Category[] = ["CLOUD", "HOSTING", "VCS", "DB", "PAYMENT", "DOMAIN", "EMAIL", "MONITOR", "AI", "TESTING", "OTHER"];

type OwnerUser = { id: string; name: string; avatarColor: string; avatarUrl: string | null; email: string; team?: string | null; position?: string | null };
type Account = {
  id: string;
  serviceName: string;
  category: Category;
  loginId: string | null;
  url: string | null;
  notes: string | null;
  ownerUser: OwnerUser | null;
  ownerName: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

type DirUser = { id: string; name: string; email: string; team?: string | null; position?: string | null; avatarColor?: string; avatarUrl?: string | null };

type FormState = {
  serviceName: string;
  category: Category;
  loginId: string;
  url: string;
  notes: string;
  ownerUserId: string; // "" = 없음
  ownerName: string;   // 외부 담당자
};

const EMPTY_FORM: FormState = {
  serviceName: "",
  category: "OTHER",
  loginId: "",
  url: "",
  notes: "",
  ownerUserId: "",
  ownerName: "",
};

export default function ServiceAccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [users, setUsers] = useState<DirUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filterCat, setFilterCat] = useState<Category | "ALL">("ALL");

  // 모달 상태 — "new" 생성, 문자열은 편집 중 id
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const canEdit = (a: Account) => user?.role === "ADMIN" || (user as any)?.superAdmin || a.createdBy.id === user?.id;

  async function load() {
    setLoading(true);
    try {
      const r = await api<{ accounts: Account[] }>("/api/service-accounts");
      setAccounts(r.accounts);
      setLoadErr(null);
    } catch (e: any) {
      setLoadErr(e?.message ?? "계정 목록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // 담당자 선택용 — 한 번만 로드
    api<{ users: DirUser[] }>("/api/users")
      .then((r) => setUsers(r.users))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return accounts.filter((a) => {
      if (filterCat !== "ALL" && a.category !== filterCat) return false;
      if (!k) return true;
      return (
        a.serviceName.toLowerCase().includes(k) ||
        (a.loginId ?? "").toLowerCase().includes(k) ||
        (a.ownerUser?.name ?? "").toLowerCase().includes(k) ||
        (a.ownerName ?? "").toLowerCase().includes(k) ||
        (a.notes ?? "").toLowerCase().includes(k)
      );
    });
  }, [accounts, q, filterCat]);

  // 카테고리별 그룹
  const grouped = useMemo(() => {
    const m = new Map<Category, Account[]>();
    for (const a of filtered) {
      const list = m.get(a.category) ?? [];
      list.push(a);
      m.set(a.category, list);
    }
    return CATEGORY_ORDER.filter((c) => m.has(c)).map((c) => ({ category: c, items: m.get(c)! }));
  }, [filtered]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormErr(null);
    setEditing("new");
  }
  function openEdit(a: Account) {
    setForm({
      serviceName: a.serviceName,
      category: a.category,
      loginId: a.loginId ?? "",
      url: a.url ?? "",
      notes: a.notes ?? "",
      ownerUserId: a.ownerUser?.id ?? "",
      ownerName: a.ownerName ?? "",
    });
    setFormErr(null);
    setEditing(a.id);
  }
  function closeModal() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErr(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.serviceName.trim()) {
      setFormErr("서비스 이름을 입력해주세요.");
      return;
    }
    setSaving(true);
    setFormErr(null);
    try {
      const payload: any = {
        serviceName: form.serviceName.trim(),
        category: form.category,
        loginId: form.loginId.trim() || null,
        url: form.url.trim() || null,
        notes: form.notes.trim() || null,
        ownerUserId: form.ownerUserId || null,
        ownerName: form.ownerName.trim() || null,
      };
      if (editing === "new") {
        await api("/api/service-accounts", { method: "POST", json: payload });
      } else if (typeof editing === "string") {
        await api(`/api/service-accounts/${editing}`, { method: "PATCH", json: payload });
      }
      closeModal();
      await load();
    } catch (err: any) {
      setFormErr(err?.message ?? "저장에 실패했어요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Account) {
    const ok = await confirmAsync({
      title: "이 계정 항목을 삭제할까요?",
      description: `"${a.serviceName}" 에 대한 기록이 사라집니다. (실제 서비스 계정은 영향받지 않아요)`,
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api(`/api/service-accounts/${a.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      alertAsync({ title: "삭제 실패", description: e?.message ?? "다시 시도해주세요" });
    }
  }

  async function copyId(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alertAsync({ title: "복사됨", description: "로그인 ID 를 클립보드에 복사했어요." });
    } catch {
      window.prompt("복사하세요", text);
    }
  }

  return (
    <div className="container-narrow py-6">
      <PageHeader
        eyebrow="팀 리소스"
        title="계정 관리"
        description="AWS · Vercel · 테스트 계정 등 팀이 쓰는 서비스 계정을 한 곳에서 관리해요. ⚠️ 비밀번호는 저장하지 마세요."
        right={
          <button className="btn-primary" onClick={openCreate}>+ 계정 추가</button>
        }
      />

      {/* 경고 배너 */}
      <div className="panel p-3 mb-4 bg-amber-50 border border-amber-200 text-[12px] text-amber-800 flex items-start gap-2">
        <span className="text-base leading-none">🔐</span>
        <div>
          <div className="font-bold">비밀번호·토큰·액세스키는 여기에 저장하지 않아요.</div>
          <div className="mt-0.5 text-amber-700">실제 크레덴셜은 1Password · Bitwarden 같은 전용 비밀번호 관리자에 두고, 여기에는 "어떤 서비스를 누가 쓰는지" 만 기록하세요.</div>
        </div>
      </div>

      {/* 검색 + 카테고리 필터 */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          className="input flex-1"
          placeholder="서비스 이름·로그인 ID·담당자·메모 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={80}
        />
        <select
          className="input sm:w-40"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value as Category | "ALL")}
        >
          <option value="ALL">전체 카테고리</option>
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{CATEGORY_META[c].emoji} {CATEGORY_META[c].label}</option>
          ))}
        </select>
      </div>

      {loadErr && (
        <div className="mb-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-[12px] text-rose-700 flex items-center justify-between gap-2">
          <span>{loadErr}</span>
          <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={load}>다시 시도</button>
        </div>
      )}

      {loading ? (
        <div className="panel py-14 text-center t-caption">불러오는 중…</div>
      ) : accounts.length === 0 ? (
        <div className="panel py-14 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-ink-100 grid place-items-center mb-3 text-xl">🔑</div>
          <div className="text-[13px] font-bold text-ink-800">아직 등록된 계정이 없어요</div>
          <div className="text-[12px] text-ink-500 mt-1">우측 상단 <b>+ 계정 추가</b> 버튼으로 첫 계정을 등록해보세요.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel py-14 text-center">
          <div className="text-[13px] font-bold text-ink-800">일치하는 계정이 없어요</div>
          <div className="text-[12px] text-ink-500 mt-1">검색어나 카테고리 필터를 바꿔보세요.</div>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, items }) => {
            const meta = CATEGORY_META[category];
            return (
              <section key={category}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-ink-500 uppercase tracking-[0.08em]">
                    <span>{meta.emoji}</span>
                    <span>{meta.label}</span>
                    <span className="text-ink-400 tabular">· {items.length}</span>
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((a) => (
                    <AccountCard
                      key={a.id}
                      a={a}
                      canEdit={canEdit(a)}
                      onEdit={() => openEdit(a)}
                      onDelete={() => remove(a)}
                      onCopy={() => a.loginId && copyId(a.loginId)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <AccountModal
          mode={editing === "new" ? "new" : "edit"}
          form={form}
          setForm={setForm}
          users={users}
          saving={saving}
          err={formErr}
          onClose={closeModal}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

function AccountCard({
  a, canEdit, onEdit, onDelete, onCopy,
}: {
  a: Account;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const meta = CATEGORY_META[a.category];
  return (
    <div className="panel p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl grid place-items-center text-white flex-shrink-0" style={{ background: meta.color }}>
          <span className="text-base leading-none">{meta.emoji}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[14px] font-extrabold text-ink-900 truncate">{a.serviceName}</div>
              <div className="text-[11px] text-ink-500">{meta.label}</div>
            </div>
            {canEdit && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={onEdit} title="편집">편집</button>
                <button className="btn-ghost !px-2 !py-1 text-[11px] text-danger" onClick={onDelete} title="삭제">삭제</button>
              </div>
            )}
          </div>

          <div className="mt-2.5 space-y-1.5 text-[12px]">
            {a.loginId && (
              <div className="flex items-center gap-1.5 text-ink-700">
                <span className="text-ink-400 w-14 flex-shrink-0">로그인</span>
                <span className="tabular truncate font-medium">{a.loginId}</span>
                <button className="btn-ghost !px-1.5 !py-0.5 text-[10px]" onClick={onCopy} title="복사">복사</button>
              </div>
            )}
            {a.url && (
              <div className="flex items-center gap-1.5 text-ink-700">
                <span className="text-ink-400 w-14 flex-shrink-0">URL</span>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline truncate">
                  {a.url}
                </a>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-ink-700">
              <span className="text-ink-400 w-14 flex-shrink-0">담당자</span>
              {a.ownerUser ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-5 h-5 rounded-full grid place-items-center text-white text-[10px] font-bold overflow-hidden"
                    style={{ background: a.ownerUser.avatarUrl ? "transparent" : a.ownerUser.avatarColor }}
                  >
                    {a.ownerUser.avatarUrl ? (
                      <img src={a.ownerUser.avatarUrl} alt={a.ownerUser.name} className="w-full h-full object-cover" />
                    ) : (
                      a.ownerUser.name[0]
                    )}
                  </span>
                  <span className="font-medium">{a.ownerUser.name}</span>
                  {a.ownerUser.team && <span className="text-ink-400 text-[11px]">· {a.ownerUser.team}</span>}
                </span>
              ) : a.ownerName ? (
                <span className="font-medium">{a.ownerName} <span className="text-ink-400 text-[11px]">· 외부</span></span>
              ) : (
                <span className="text-ink-400">미지정</span>
              )}
            </div>
            {a.notes && (
              <div className="mt-1.5 pt-1.5 border-t border-ink-100 text-ink-600 whitespace-pre-wrap break-words text-[11.5px]">{a.notes}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountModal({
  mode, form, setForm, users, saving, err, onClose, onSubmit,
}: {
  mode: "new" | "edit";
  form: FormState;
  setForm: (f: FormState) => void;
  users: DirUser[];
  saving: boolean;
  err: string | null;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  // Esc 로 닫기
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-ink-900/40 grid place-items-center p-4 z-50" onClick={onClose}>
      <div className="panel w-full max-w-lg shadow-pop" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="계정 편집">
        <div className="section-head">
          <div className="title">{mode === "new" ? "새 계정 추가" : "계정 편집"}</div>
          <button className="btn-icon" onClick={onClose} aria-label="닫기">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <form className="p-5 space-y-3 max-h-[75vh] overflow-auto" onSubmit={onSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ink-500">서비스 이름 *</span>
              <input
                className="input"
                placeholder='예: "AWS 프로덕션", "Vercel - hinest"'
                value={form.serviceName}
                maxLength={80}
                required
                autoFocus
                onChange={(e) => setForm({ ...form, serviceName: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ink-500">카테고리</span>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              >
                {CATEGORY_ORDER.map((c) => (
                  <option key={c} value={c}>{CATEGORY_META[c].emoji} {CATEGORY_META[c].label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-ink-500">로그인 ID / 이메일</span>
            <input
              className="input"
              placeholder="예: ops@hinest.com"
              value={form.loginId}
              maxLength={200}
              onChange={(e) => setForm({ ...form, loginId: e.target.value })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-ink-500">콘솔 URL</span>
            <input
              className="input"
              type="url"
              placeholder="https://console.aws.amazon.com"
              value={form.url}
              maxLength={500}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ink-500">담당자 (사내)</span>
              <select
                className="input"
                value={form.ownerUserId}
                onChange={(e) => setForm({ ...form, ownerUserId: e.target.value, ownerName: e.target.value ? "" : form.ownerName })}
              >
                <option value="">선택 안 함</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.team ? ` · ${u.team}` : ""}{u.position ? ` · ${u.position}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ink-500">담당자 (외부)</span>
              <input
                className="input"
                placeholder="사내 유저가 아닐 때 수기 입력"
                value={form.ownerName}
                maxLength={80}
                disabled={!!form.ownerUserId}
                onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold text-ink-500">메모 <span className="text-rose-600 font-normal">(비밀번호 금지)</span></span>
            <textarea
              className="input"
              rows={3}
              placeholder="접근 방법, MFA 장치, 요금제 등 자유 메모"
              value={form.notes}
              maxLength={2000}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            <span className="text-[10px] text-ink-400">⚠️ 비밀번호·액세스키·API 토큰은 여기에 쓰지 마세요. 전용 비밀번호 관리자에 두세요.</span>
          </label>

          {err && <div className="text-[12px] text-rose-600 p-2 rounded-lg bg-rose-50 border border-rose-200">{err}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>취소</button>
            <button className="btn-primary" disabled={saving}>
              {saving ? "저장 중…" : (mode === "new" ? "추가" : "저장")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
