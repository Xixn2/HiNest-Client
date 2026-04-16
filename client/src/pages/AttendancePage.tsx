import { useEffect, useState } from "react";
import { api } from "../api";
import PageHeader from "../components/PageHeader";
import { useAuth } from "../auth";

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

  useEffect(() => {
    load();
  }, [month]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api("/api/attendance/leave", { method: "POST", json: form });
    setOpen(false);
    setForm({ type: "ANNUAL", startDate: "", endDate: "", reason: "" });
    load();
  }

  async function review(id: string, status: string) {
    await api(`/api/attendance/leave/${id}`, { method: "PATCH", json: { status } });
    load();
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
          <div className="flex gap-2">
            <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button className="btn-primary" onClick={() => setOpen(true)}>
              + 휴가 신청
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 card">
          <h2 className="text-lg font-bold mb-4">{month} 출퇴근 기록</h2>
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full text-sm">
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
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="w-full text-sm">
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
                          <button className="text-xs px-3 py-1 rounded-lg bg-brand-400 text-white" onClick={() => review(l.id, "APPROVED")}>
                            승인
                          </button>
                          <button className="text-xs px-3 py-1 rounded-lg bg-rose-500 text-white" onClick={() => review(l.id, "REJECTED")}>
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
                  <option value="OTHER">기타</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">시작일</label>
                  <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
                </div>
                <div>
                  <label className="label">종료일</label>
                  <input type="date" className="input" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
                </div>
              </div>
              <div>
                <label className="label">사유</label>
                <textarea className="input" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  취소
                </button>
                <button className="btn-primary">신청</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function typeLabel(t: string) {
  return { ANNUAL: "연차", HALF: "반차", SICK: "병가", OTHER: "기타" }[t] ?? t;
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
