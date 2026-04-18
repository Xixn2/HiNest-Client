import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";
import MonthPicker from "../components/MonthPicker";
import DateTimePicker from "../components/DateTimePicker";

type Expense = {
  id: string;
  userId: string;
  usedAt: string;
  merchant: string;
  category: string;
  amount: number;
  memo?: string;
  receiptUrl?: string;
  status: string;
  user?: { name: string; team?: string };
};

const CATEGORIES = ["식비", "교통", "업무", "접대", "비품", "기타"];

function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayDT() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ExpensePage() {
  const { user } = useAuth();
  const isReviewer = user?.role === "ADMIN" || user?.role === "MANAGER";
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [month, setMonth] = useState(ymNow());
  const [list, setList] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    usedAt: todayDT(),
    merchant: "",
    category: "식비",
    amount: 0,
    memo: "",
    receiptUrl: "",
  });
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const q = new URLSearchParams();
    if (scope === "all") q.set("all", "1");
    q.set("month", month);
    const res = await api<{ expenses: Expense[]; totalAmount: number }>(`/api/expense?${q.toString()}`);
    setList(res.expenses);
    setTotal(res.totalAmount);
  }

  useEffect(() => {
    load();
  }, [scope, month]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 1024 * 1024 * 3) return alert("영수증은 3MB 이하 이미지만 업로드 가능합니다");
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setForm((p) => ({ ...p, receiptUrl: url }));
    };
    reader.readAsDataURL(f);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api("/api/expense", {
      method: "POST",
      json: {
        ...form,
        usedAt: new Date(form.usedAt).toISOString(),
        amount: Number(form.amount),
      },
    });
    setOpen(false);
    setForm({ usedAt: todayDT(), merchant: "", category: "식비", amount: 0, memo: "", receiptUrl: "" });
    if (fileRef.current) fileRef.current.value = "";
    load();
  }

  async function review(id: string, status: string) {
    await api(`/api/expense/${id}`, { method: "PATCH", json: { status } });
    load();
  }

  async function remove(id: string) {
    if (!confirm("삭제하시겠습니까?")) return;
    await api(`/api/expense/${id}`, { method: "DELETE" });
    load();
  }

  const summary = list.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.amount;
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="법인카드 사용내역"
        description="법인카드 사용건을 등록하고 영수증을 첨부합니다."
        right={
          <div className="flex gap-2">
            <MonthPicker value={month} onChange={setMonth} />
            {isReviewer && (
              <select className="input" value={scope} onChange={(e) => setScope(e.target.value as any)}>
                <option value="mine">내 사용내역</option>
                <option value="all">전체</option>
              </select>
            )}
            <button className="btn-primary" onClick={() => setOpen(true)}>
              + 사용내역 등록
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* 월 합계: 브랜드 컬러 강조 카드 */}
        <div
          className="panel p-5 text-white relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, var(--c-brand) 0%, var(--c-brand-hover) 100%)",
            borderColor: "transparent",
          }}
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.06em] opacity-90">
            {month} 합계
          </div>
          <div className="text-[24px] font-extrabold mt-2 tabular" style={{ letterSpacing: "-0.02em" }}>
            {total.toLocaleString()}<span className="text-[15px] font-bold opacity-90 ml-0.5">원</span>
          </div>
          <div className="text-[11.5px] opacity-90 mt-1">
            {list.length > 0 ? `총 ${list.length}건 사용` : "사용 내역 없음"}
          </div>
        </div>
        {CATEGORIES.slice(0, 3).map((c) => {
          const amount = summary[c] ?? 0;
          return (
            <div key={c} className="panel p-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-500">{c}</div>
              <div className="text-[20px] font-extrabold text-ink-900 mt-2 tabular" style={{ letterSpacing: "-0.02em" }}>
                {amount.toLocaleString()}<span className="text-[13px] font-bold text-ink-500 ml-0.5">원</span>
              </div>
              <div className="text-[11.5px] text-ink-500 mt-1">
                {amount > 0 ? "이번 달 집계" : "내역 없음"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-left px-4 py-3">사용일시</th>
              {scope === "all" && <th className="text-left px-4 py-3">사용자</th>}
              <th className="text-left px-4 py-3">사용처</th>
              <th className="text-left px-4 py-3">분류</th>
              <th className="text-right px-4 py-3">금액</th>
              <th className="text-left px-4 py-3">메모</th>
              <th className="text-center px-4 py-3">영수증</th>
              <th className="text-center px-4 py-3">상태</th>
              <th className="text-right px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  등록된 사용내역이 없습니다.
                </td>
              </tr>
            )}
            {list.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                <td className="px-4 py-3">
                  {new Date(e.usedAt).toLocaleString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                {scope === "all" && <td className="px-4 py-3">{e.user?.name}</td>}
                <td className="px-4 py-3 font-medium">{e.merchant}</td>
                <td className="px-4 py-3">
                  <span className="chip bg-slate-100 text-slate-700">{e.category}</span>
                </td>
                <td className="px-4 py-3 text-right font-semibold">{e.amount.toLocaleString()}원</td>
                <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate">{e.memo || "-"}</td>
                <td className="px-4 py-3 text-center">
                  {e.receiptUrl ? (
                    <button className="text-brand-600 text-xs underline" onClick={() => setPreview(e.receiptUrl!)}>
                      보기
                    </button>
                  ) : (
                    <span className="text-slate-300 text-xs">-</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <StatusChip status={e.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  {isReviewer && e.status === "PENDING" && scope === "all" && (
                    <div className="inline-flex gap-1">
                      <button className="text-xs px-2 py-1 rounded-lg bg-brand-400 text-white" onClick={() => review(e.id, "APPROVED")}>
                        승인
                      </button>
                      <button className="text-xs px-2 py-1 rounded-lg bg-rose-500 text-white" onClick={() => review(e.id, "REJECTED")}>
                        반려
                      </button>
                    </div>
                  )}
                  {e.userId === user?.id && e.status === "PENDING" && (
                    <button className="text-xs text-rose-500 ml-2" onClick={() => remove(e.id)}>
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-slate-900/40 grid place-items-center p-4 z-50" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">법인카드 사용내역 등록</h3>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">사용일시</label>
                  <DateTimePicker value={form.usedAt} onChange={(v) => setForm({ ...form, usedAt: v })} />
                </div>
                <div>
                  <label className="label">금액 (원)</label>
                  <input type="number" className="input" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} required min={0} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">사용처</label>
                  <input className="input" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} required />
                </div>
                <div>
                  <label className="label">분류</label>
                  <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">메모</label>
                <textarea className="input" rows={2} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
              </div>
              <div>
                <label className="label">영수증 (이미지, 3MB 이하)</label>
                <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="text-sm" />
                {form.receiptUrl && (
                  <img src={form.receiptUrl} alt="receipt" className="mt-2 max-h-40 rounded-lg border border-slate-200" />
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  취소
                </button>
                <button className="btn-primary">등록</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 bg-slate-900/70 grid place-items-center p-4 z-50" onClick={() => setPreview(null)}>
          <img src={preview} alt="receipt" className="max-h-[90vh] max-w-[90vw] rounded-xl" />
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-amber-100 text-amber-700",
    APPROVED: "bg-brand-100 text-brand-700",
    REJECTED: "bg-rose-100 text-rose-700",
  };
  const label: Record<string, string> = {
    PENDING: "대기",
    APPROVED: "승인",
    REJECTED: "반려",
  };
  return <span className={`chip ${map[status] ?? ""}`}>{label[status] ?? status}</span>;
}
