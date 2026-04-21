import { useEffect, useState } from "react";
import { api, apiSWR } from "../api";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../auth";
import MonthPicker from "../components/MonthPicker";
import DateTimePicker from "../components/DateTimePicker";

type Attendance = {
  id: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
};

type Leave = {
  id: string;
  userId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: string;
  user?: { name: string; team?: string };
};

function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AttendancePage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(ymNow());
  const [records, setRecords] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [allLeaves, setAllLeaves] = useState<Leave[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: "ANNUAL", startDate: "", endDate: "", reason: "" });
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function load() {
    const [m, l] = await Promise.all([
      api<{ attendances: Attendance[] }>(`/api/attendance/month?month=${month}`),
      api<{ leaves: Leave[] }>("/api/attendance/leave"),
    ]);
    setRecords(m.attendances);
    setLeaves(l.leaves);

    if (user?.role === "ADMIN" || user?.role === "MANAGER") {
      const all = await api<{ leaves: Leave[] }>("/api/attendance/leave?all=1");
      setAllLeaves(all.leaves);
    }
  }

  // SWR — 월별 출퇴근과 휴가 목록은 탭 재진입 시 캐시로 즉시 채움.
  const isReviewer = user?.role === "ADMIN" || user?.role === "MANAGER";
  useEffect(() => {
    apiSWR<{ attendances: Attendance[] }>(`/api/attendance/month?month=${month}`, {
      onCached: (d) => setRecords(d.attendances),
      onFresh: (d) => setRecords(d.attendances),
    });
    apiSWR<{ leaves: Leave[] }>("/api/attendance/leave", {
      onCached: (d) => setLeaves(d.leaves),
      onFresh: (d) => setLeaves(d.leaves),
    });
    if (isReviewer) {
      apiSWR<{ leaves: Leave[] }>("/api/attendance/leave?all=1", {
        onCached: (d) => setAllLeaves(d.leaves),
        onFresh: (d) => setAllLeaves(d.leaves),
      });
    }
  }, [month, isReviewer]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.startDate || !form.endDate) return alert("시작/종료일을 선택해주세요");
    if (new Date(form.endDate) < new Date(form.startDate))
      return alert("종료일이 시작일보다 빨라요");
    setSaving(true);
    try {
      await api("/api/attendance/leave", { method: "POST", json: form });
      setOpen(false);
      setForm({ type: "ANNUAL", startDate: "", endDate: "", reason: "" });
      await load();
    } catch (err: any) {
      alert(err?.message ?? "휴가 신청에 실패했어요");
    } finally {
      setSaving(false);
    }
  }

  async function review(id: string, status: string) {
    if (reviewingId) return;
    setReviewingId(id);
    try {
      await api(`/api/attendance/leave/${id}`, { method: "PATCH", json: { status } });
      await load();
    } catch (err: any) {
      alert(err?.message ?? "승인·반려에 실패했어요");
    } finally {
      setReviewingId(null);
    }
  }

  function duration(c?: string, o?: string) {
    if (!c || !o) return "-";
    const ms = new Date(o).getTime() - new Date(c).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}시간 ${m}분`;
  }

  return (
    <div>
      <PageHeader
        title="근태 · 월차"
        description="월별 출퇴근 기록과 휴가 신청을 관리합니다."
        right={
          <div className="flex gap-2 flex-wrap">
            <MonthPicker value={month} onChange={setMonth} />
            <button className="btn-primary" onClick={() => setOpen(true)}>
              + 휴가 신청
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-bold mb-4">{month} 출퇴근 기록</h2>
          <div className="overflow-hidden rounded-xl border border-slate-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-3">일자</th>
                  <th className="text-left px-4 py-3">출근</th>
                  <th className="text-left px-4 py-3">퇴근</th>
                  <th className="text-left px-4 py-3">근무시간</th>
                </tr>
              </thead>
              <tbody>
                {records.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                      기록이 없습니다.
                    </td>
                  </tr>
                )}
                {records.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{r.date}</td>
                    <td className="px-4 py-3">
                      {r.checkIn ? new Date(r.checkIn).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {r.checkOut ? new Date(r.checkOut).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{duration(r.checkIn, r.checkOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-bold mb-4">내 휴가 신청</h2>
          <div className="space-y-3">
            {leaves.length === 0 && <div className="text-sm text-slate-400">신청 내역이 없습니다.</div>}
            {leaves.map((l) => (
              <div key={l.id} className="p-3 rounded-xl border border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{typeLabel(l.type)}</div>
                  <StatusChip status={l.status} />
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {new Date(l.startDate).toLocaleDateString("ko-KR")} ~ {new Date(l.endDate).toLocaleDateString("ko-KR")}
                </div>
                {l.reason && <div className="text-sm text-slate-600 mt-1">{l.reason}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {(user?.role === "ADMIN" || user?.role === "MANAGER") && (
        <div className="card mt-6">
          <h2 className="text-lg font-bold mb-4">전체 휴가 승인 대기</h2>
          <div className="overflow-hidden rounded-xl border border-slate-100 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-4 py-3">이름</th>
                  <th className="text-left px-4 py-3">종류</th>
                  <th className="text-left px-4 py-3">기간</th>
                  <th className="text-left px-4 py-3">사유</th>
                  <th className="text-left px-4 py-3">상태</th>
                  <th className="text-right px-4 py-3">처리</th>
                </tr>
              </thead>
              <tbody>
                {allLeaves.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{l.user?.name}</td>
                    <td className="px-4 py-3">{typeLabel(l.type)}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {new Date(l.startDate).toLocaleDateString("ko-KR")} ~ {new Date(l.endDate).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{l.reason || "-"}</td>
                    <td className="px-4 py-3">
                      <StatusChip status={l.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {l.status === "PENDING" && (
                        <div className="inline-flex gap-1">
                          <button
                            className="text-xs px-3 py-1 rounded-lg bg-brand-400 text-white disabled:opacity-60"
                            onClick={() => review(l.id, "APPROVED")}
                            disabled={reviewingId === l.id}
                          >
                            {reviewingId === l.id ? "처리 중…" : "승인"}
                          </button>
                          <button
                            className="text-xs px-3 py-1 rounded-lg bg-rose-500 text-white disabled:opacity-60"
                            onClick={() => review(l.id, "REJECTED")}
                            disabled={reviewingId === l.id}
                          >
                            반려
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-slate-900/40 grid place-items-center p-4" onClick={() => setOpen(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">휴가 신청</h3>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="label">종류</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  <option value="ANNUAL">연차</option>
                  <option value="HALF">반차</option>
                  <option value="SICK">병가</option>
                  <option value="TRIP">외근</option>
                  <option value="OTHER">기타</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">시작일</label>
                  <DateTimePicker mode="date" value={form.startDate} onChange={(v) => setForm({ ...form, startDate: v })} />
                </div>
                <div>
                  <label className="label">종료일</label>
                  <DateTimePicker mode="date" value={form.endDate} onChange={(v) => setForm({ ...form, endDate: v })} min={form.startDate} />
                </div>
              </div>
              <div>
                <label className="label">사유</label>
                <textarea className="input" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={saving}>
                  취소
                </button>
                <button className="btn-primary" disabled={saving}>{saving ? "신청 중…" : "신청"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function typeLabel(t: string) {
  return { ANNUAL: "연차", HALF: "반차", SICK: "병가", TRIP: "외근", OTHER: "기타" }[t] ?? t;
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
