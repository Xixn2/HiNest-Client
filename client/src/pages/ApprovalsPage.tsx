import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";
import DateTimePicker from "../components/DateTimePicker";

type ApprovalType = "TRIP" | "OFFSITE" | "EXPENSE" | "PURCHASE" | "GENERAL" | "OTHER";
type Step = {
  id: string;
  order: number;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
  comment?: string | null;
  actedAt?: string | null;
  reviewer: { id: string; name: string; avatarColor: string; position?: string | null };
};
type Approval = {
  id: string;
  type: ApprovalType;
  title: string;
  content?: string;
  data?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
  startDate?: string;
  endDate?: string;
  amount?: number;
  createdAt: string;
  requester: { id: string; name: string; avatarColor: string; position?: string; team?: string };
  steps: Step[];
  currentReviewerId?: string;
};

type DirUser = { id: string; name: string; email: string; team?: string; position?: string; avatarColor?: string };

const TYPE_META: Record<ApprovalType, { label: string; color: string; icon: JSX.Element }> = {
  TRIP:     { label: "출장 신청",   color: "#0EA5E9", icon: <IconSvg><><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></></IconSvg> },
  OFFSITE:  { label: "외근 신청",   color: "#16A34A", icon: <IconSvg><><rect x="2" y="8" width="16" height="8" rx="2" /><path d="M6 8V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><circle cx="6" cy="17" r="2" /><circle cx="14" cy="17" r="2" /></></IconSvg> },
  EXPENSE:  { label: "지출결의",    color: "#D97706", icon: <IconSvg><><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9h4.5a2 2 0 0 1 0 4H9a2 2 0 0 0 0 4h5" /></></IconSvg> },
  PURCHASE: { label: "구매 요청",   color: "#DC2626", icon: <IconSvg><><path d="M3 3h2l2 14h12l2-10H7" /><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /></></IconSvg> },
  GENERAL:  { label: "일반 품의",   color: "#3D54C4", icon: <IconSvg><><path d="M4 4h12l4 4v12H4z" /><path d="M14 4v5h5M8 12h8M8 16h6" /></></IconSvg> },
  OTHER:    { label: "기타",       color: "#6B7280", icon: <IconSvg><><circle cx="12" cy="12" r="9" /><path d="M8 12h8M12 8v8" /></></IconSvg> },
};

function IconSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
  );
}

const STATUS_META: Record<Approval["status"], { label: string; chip: string }> = {
  PENDING:  { label: "진행 중",  chip: "chip-amber" },
  APPROVED: { label: "승인 완료", chip: "chip-green" },
  REJECTED: { label: "반려",     chip: "chip-red" },
  CANCELED: { label: "취소됨",    chip: "chip-gray" },
};

export default function ApprovalsPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [scope, setScope] = useState<"mine" | "pending">("mine");
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [selected, setSelected] = useState<Approval | null>(null);
  const [creating, setCreating] = useState(false);
  const [directory, setDirectory] = useState<DirUser[]>([]);

  async function load() {
    const res = await api<{ approvals: Approval[] }>(`/api/approval?scope=${scope}`);
    setApprovals(res.approvals);
    if (selected) {
      const fresh = res.approvals.find((a) => a.id === selected.id);
      if (fresh) setSelected(fresh);
    }
  }
  async function loadDirectory() {
    const res = await api<{ users: DirUser[] }>("/api/users");
    setDirectory(res.users);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [scope]);
  useEffect(() => { loadDirectory(); }, []);

  // ?id=xxx 진입 시 자동 선택
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const id = qs.get("id");
    if (!id || approvals.length === 0) return;
    const m = approvals.find((a) => a.id === id);
    if (m) {
      setSelected(m);
      navigate("/approvals", { replace: true });
    }
    // eslint-disable-next-line
  }, [approvals, location.search]);

  async function act(id: string, action: "approve" | "reject") {
    const comment = action === "reject" ? prompt("반려 사유 (선택)") ?? undefined : undefined;
    await api(`/api/approval/${id}/act`, { method: "POST", json: { action, comment } });
    load();
  }

  async function cancel(id: string) {
    if (!confirm("결재를 취소하시겠습니까?")) return;
    await api(`/api/approval/${id}/cancel`, { method: "POST" });
    load();
  }

  const pendingCount = useMemo(
    () => approvals.filter((a) => a.status === "PENDING").length,
    [approvals]
  );

  return (
    <div>
      <PageHeader
        eyebrow="업무"
        title="전자결재"
        description="출장·외근·지출·구매 등 사내 결재를 한 곳에서 관리합니다."
        right={
          <>
            <div className="tabs flex-shrink-0">
              <button className={`tab ${scope === "mine" ? "tab-active" : ""}`} onClick={() => setScope("mine")}>
                내 신청 <span className="ml-1 tabular text-ink-500">{scope === "mine" ? pendingCount : ""}</span>
              </button>
              <button className={`tab ${scope === "pending" ? "tab-active" : ""}`} onClick={() => setScope("pending")}>
                결재 대기 <span className="ml-1 tabular text-ink-500">{scope === "pending" ? approvals.length : ""}</span>
              </button>
            </div>
            <button className="btn-primary" onClick={() => setCreating(true)}>+ 새 결재</button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 panel p-0 overflow-hidden">
          <div className="section-head">
            <div className="title">{scope === "mine" ? "내 신청 목록" : "결재 대기"}</div>
            <span className="text-[11px] text-ink-400 tabular">{approvals.length}건</span>
          </div>
          <div className="divide-y divide-ink-100 max-h-[70vh] overflow-auto">
            {approvals.length === 0 && (
              <div className="py-14 text-center t-caption">해당 항목이 없습니다.</div>
            )}
            {approvals.map((a) => {
              const meta = TYPE_META[a.type];
              const smeta = STATUS_META[a.status];
              const mine = a.requester.id === user?.id;
              const myTurn = a.currentReviewerId === user?.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={`w-full text-left px-4 py-3 hover:bg-ink-25 flex items-start gap-3 ${selected?.id === a.id ? "bg-brand-50" : ""}`}
                >
                  <div className="w-9 h-9 rounded-lg grid place-items-center text-[15px] flex-shrink-0" style={{ background: meta.color + "1A", color: meta.color }}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-ink-600">{meta.label}</span>
                      <span className={smeta.chip}>{smeta.label}</span>
                      {myTurn && scope === "pending" && <span className="chip-red">내 차례</span>}
                    </div>
                    <div className="text-[13px] font-bold text-ink-900 truncate mt-0.5">{a.title}</div>
                    <div className="text-[11px] text-ink-500 tabular mt-0.5">
                      {mine ? "내가 요청" : a.requester.name} · {new Date(a.createdAt).toLocaleDateString("ko-KR")}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-3 panel p-0 overflow-hidden">
          {selected ? (
            <ApprovalDetail
              a={selected}
              meId={user?.id}
              onAct={act}
              onCancel={cancel}
            />
          ) : (
            <div className="grid place-items-center h-[70vh]">
              <div className="text-center">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-ink-100 grid place-items-center mb-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8E959E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                  </svg>
                </div>
                <div className="text-[13px] font-bold text-ink-800">결재 항목을 선택하세요</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {creating && <CreateModal directory={directory} meId={user?.id} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function ApprovalDetail({
  a, meId, onAct, onCancel,
}: {
  a: Approval;
  meId?: string;
  onAct: (id: string, action: "approve" | "reject") => void;
  onCancel: (id: string) => void;
}) {
  const meta = TYPE_META[a.type];
  const smeta = STATUS_META[a.status];
  const myTurn = a.currentReviewerId === meId;
  const isRequester = a.requester.id === meId;
  const data = a.data ? safeJson(a.data) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="section-head">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: meta.color + "1A", color: meta.color }}>{meta.icon}</div>
          <div>
            <div className="text-[11px] font-bold text-ink-600">{meta.label}</div>
            <div className="title">{a.title}</div>
          </div>
        </div>
        <span className={smeta.chip}>{smeta.label}</span>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoField label="신청자" value={`${a.requester.name}${a.requester.position ? " · " + a.requester.position : ""}${a.requester.team ? " · " + a.requester.team : ""}`} />
          <InfoField label="신청일" value={new Date(a.createdAt).toLocaleString("ko-KR")} tabular />
          {a.startDate && <InfoField label="시작" value={new Date(a.startDate).toLocaleDateString("ko-KR")} tabular />}
          {a.endDate && <InfoField label="종료" value={new Date(a.endDate).toLocaleDateString("ko-KR")} tabular />}
          {typeof a.amount === "number" && <InfoField label="금액" value={`${a.amount.toLocaleString()}원`} tabular />}
          {data?.destination && <InfoField label="목적지" value={data.destination} />}
        </div>

        {a.content && (
          <div>
            <div className="text-[11px] font-extrabold text-ink-500 uppercase tracking-[0.08em] mb-1.5">내용</div>
            <div className="panel p-3 text-[13px] whitespace-pre-wrap text-ink-800 leading-[1.55]">{a.content}</div>
          </div>
        )}

        <div>
          <div className="text-[11px] font-extrabold text-ink-500 uppercase tracking-[0.08em] mb-2">결재선</div>
          <div className="space-y-2">
            {a.steps.map((s, idx) => (
              <div key={s.id} className="panel p-3 flex items-center gap-3">
                <div className="w-6 h-6 rounded-full grid place-items-center text-white text-[11px] font-bold tabular flex-shrink-0" style={{ background: stepColor(s.status) }}>
                  {idx + 1}
                </div>
                <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-bold flex-shrink-0" style={{ background: s.reviewer.avatarColor }}>
                  {s.reviewer.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-ink-900">{s.reviewer.name}{s.reviewer.position ? ` · ${s.reviewer.position}` : ""}</div>
                  {s.comment && <div className="text-[11px] text-ink-600 mt-0.5 italic">"{s.comment}"</div>}
                  {s.actedAt && <div className="text-[10px] text-ink-400 tabular mt-0.5">{new Date(s.actedAt).toLocaleString("ko-KR")}</div>}
                </div>
                <StepChip status={s.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {a.status === "PENDING" && (
        <div className="border-t border-ink-150 px-5 py-3 flex items-center gap-2">
          {myTurn && (
            <>
              <button className="btn-primary flex-1" onClick={() => onAct(a.id, "approve")}>승인</button>
              <button className="btn-danger flex-1" onClick={() => onAct(a.id, "reject")}>반려</button>
            </>
          )}
          {isRequester && !myTurn && (
            <button className="btn-ghost" onClick={() => onCancel(a.id)}>결재 취소</button>
          )}
          {!myTurn && !isRequester && (
            <div className="text-[12px] text-ink-500">다른 결재자의 차례입니다.</div>
          )}
        </div>
      )}
    </div>
  );
}

function CreateModal({
  directory, meId, onClose, onDone,
}: {
  directory: DirUser[];
  meId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<{
    type: ApprovalType;
    title: string;
    content: string;
    startDate: string;
    endDate: string;
    amount: string;
    destination: string;
    reviewerIds: string[];
  }>({
    type: "TRIP",
    title: "",
    content: "",
    startDate: "",
    endDate: "",
    amount: "",
    destination: "",
    reviewerIds: [],
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return alert("제목을 입력해주세요");
    if (form.reviewerIds.length === 0) return alert("결재자를 1명 이상 선택해주세요");
    const payload: any = {
      type: form.type,
      title: form.title,
      content: form.content || undefined,
      reviewerIds: form.reviewerIds,
    };
    if (form.startDate) payload.startDate = new Date(form.startDate).toISOString();
    if (form.endDate) payload.endDate = new Date(form.endDate).toISOString();
    if (form.amount) payload.amount = Number(form.amount);
    if (form.type === "TRIP" || form.type === "OFFSITE") {
      payload.data = { destination: form.destination };
    }
    await api("/api/approval", { method: "POST", json: payload });
    onDone();
  }

  const needDates = form.type === "TRIP" || form.type === "OFFSITE";
  const needAmount = form.type === "EXPENSE" || form.type === "PURCHASE";
  const needDestination = form.type === "TRIP" || form.type === "OFFSITE";

  return (
    <div className="fixed inset-0 bg-ink-900/40 grid place-items-center p-4 z-50" onClick={onClose}>
      <div className="panel w-full max-w-[560px] shadow-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <div className="title">새 결재 올리기</div>
          <button className="btn-icon" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3 max-h-[80vh] overflow-auto">
          <div>
            <label className="field-label">결재 종류</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.keys(TYPE_META) as ApprovalType[]).map((t) => {
                const meta = TYPE_META[t];
                const active = form.type === t;
                return (
                  <button
                    type="button"
                    key={t}
                    className={`h-[60px] rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 transition ${
                      active ? "border-brand-500 bg-brand-50" : "border-ink-150 hover:border-ink-300"
                    }`}
                    onClick={() => setForm({ ...form, type: t })}
                  >
                    <div style={{ color: active ? meta.color : "#4A5058" }}>{meta.icon}</div>
                    <div className="text-[11px] font-bold text-ink-800">{meta.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="field-label">제목</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </div>
          <div>
            <label className="field-label">내용</label>
            <textarea className="input" rows={3} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </div>

          {needDates && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">시작일</label>
                <DateTimePicker mode="date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
              </div>
              <div>
                <label className="field-label">종료일</label>
                <DateTimePicker mode="date" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} min={form.startDate} />
              </div>
            </div>
          )}

          {needDestination && (
            <div>
              <label className="field-label">목적지</label>
              <input className="input" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="예: 부산 지사" />
            </div>
          )}

          {needAmount && (
            <div>
              <label className="field-label">금액 (원)</label>
              <input type="number" className="input tabular" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
          )}

          <div>
            <label className="field-label">결재선 <span className="text-ink-500 font-normal">(순서대로 결재됨 · {form.reviewerIds.length}명)</span></label>
            <div className="max-h-48 overflow-auto rounded-xl border border-ink-150 divide-y divide-ink-100">
              {directory.filter((d) => d.id !== meId).map((d) => {
                const idx = form.reviewerIds.indexOf(d.id);
                const checked = idx >= 0;
                return (
                  <label key={d.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${checked ? "bg-brand-50" : "hover:bg-ink-25"}`}>
                    <input type="checkbox" className="accent-brand-500"
                      checked={checked}
                      onChange={(e) => setForm((f) => e.target.checked
                        ? { ...f, reviewerIds: [...f.reviewerIds, d.id] }
                        : { ...f, reviewerIds: f.reviewerIds.filter((x) => x !== d.id) })
                      }
                    />
                    {checked && <span className="w-5 h-5 rounded bg-brand-500 text-white text-[10px] font-bold grid place-items-center tabular">{idx + 1}</span>}
                    <div className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px] font-bold" style={{ background: d.avatarColor ?? "#3D54C4" }}>{d.name[0]}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-ink-900">{d.name}</div>
                      <div className="text-[11px] text-ink-500 truncate">{d.position ?? "—"}{d.team ? ` · ${d.team}` : ""}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
            <button className="btn-primary">상신</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InfoField({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-extrabold text-ink-500 uppercase tracking-[0.06em]">{label}</div>
      <div className={`text-[13px] text-ink-900 mt-0.5 ${tabular ? "tabular" : ""}`}>{value}</div>
    </div>
  );
}

function StepChip({ status }: { status: Step["status"] }) {
  if (status === "APPROVED") return <span className="chip-green">승인</span>;
  if (status === "REJECTED") return <span className="chip-red">반려</span>;
  if (status === "SKIPPED") return <span className="chip-gray">건너뜀</span>;
  return <span className="chip-amber">대기</span>;
}

function stepColor(s: Step["status"]) {
  if (s === "APPROVED") return "#16A34A";
  if (s === "REJECTED") return "#DC2626";
  return "#B0B8C1";
}

function safeJson(s: string) {
  try { return JSON.parse(s); } catch { return null; }
}
