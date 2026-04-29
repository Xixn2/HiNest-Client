import { useEffect, useState } from "react";
import { api } from "../../api";

type Check = { ok: boolean; latencyMs?: number; detail?: string; meta?: any };
type Health = { ok: boolean; ts: number; checks: Record<string, Check> };

const ORDER = ["db", "migrations", "s3", "process", "env"];

const LABELS: Record<string, string> = {
  db: "Database (Postgres)",
  migrations: "Prisma Migrations",
  s3: "S3 Storage",
  process: "Node Process",
  env: "Environment Vars",
};

/** 운영 인프라 신호등 — 한 화면에 DB / 마이그레이션 / S3 / 프로세스 / 환경변수 상태. */
export default function HealthPanel() {
  const [h, setH] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(false);

  async function load() {
    setLoading(true);
    try { setH(await api<Health>("/api/admin/health")); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [auto]);

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 mb-3">
        <button className="btn-ghost btn-xs" onClick={load} disabled={loading}>{loading ? "체크 중…" : "새로고침"}</button>
        <label className="text-[12px] text-ink-500 inline-flex items-center gap-1.5">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          자동 (15s)
        </label>
        {h && (
          <span className="ml-auto text-[11px] text-ink-500">
            {h.ok ? "✅ All systems operational" : "⚠️ 일부 시스템 이상"} · {new Date(h.ts).toLocaleTimeString("ko-KR")}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ORDER.map((key) => {
          const c = h?.checks?.[key];
          return <CheckCard key={key} title={LABELS[key]} c={c} />;
        })}
      </div>
    </div>
  );
}

function CheckCard({ title, c }: { title: string; c?: Check }) {
  const ok = !!c?.ok;
  return (
    <div
      className="rounded-xl p-3.5 border"
      style={{
        background: ok ? "rgba(22,163,74,0.06)" : "rgba(220,38,38,0.06)",
        borderColor: ok ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)",
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: ok ? "var(--c-success)" : "var(--c-danger)" }}
        />
        <div className="text-[13px] font-extrabold text-ink-900 flex-1">{title}</div>
        {c?.latencyMs != null && (
          <div className="text-[10.5px] font-mono text-ink-500">{c.latencyMs}ms</div>
        )}
      </div>
      {c?.detail && (
        <div className="text-[11px] text-rose-600 mb-1.5 break-all">{c.detail}</div>
      )}
      {c?.meta && (
        <div className="text-[10.5px] text-ink-500 font-mono space-y-0.5">
          {Object.entries(c.meta).map(([k, v]) => (
            <div key={k} className="truncate">
              <span className="text-ink-400">{k}:</span>{" "}
              <span className="text-ink-700">
                {typeof v === "boolean" ? (v ? "✓" : "✗ 누락") : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
