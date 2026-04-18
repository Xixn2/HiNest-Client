import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

type Results = {
  people?: any[];
  notices?: any[];
  events?: any[];
  documents?: any[];
  messages?: any[];
};

export default function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results>({});
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    if (!open) { setQ(""); setResults({}); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!q.trim()) { setResults({}); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api<{ results: Results }>(`/api/search?q=${encodeURIComponent(q.trim())}`);
        setResults(res.results);
      } catch {} finally { setLoading(false); }
    }, 180);
    return () => clearTimeout(t);
  }, [q, open]);

  function go(path: string) {
    onClose();
    nav(path);
  }

  const totalCount = useMemo(() => {
    return Object.values(results).reduce((n: number, arr: any) => n + (arr?.length ?? 0), 0);
  }, [results]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] bg-ink-900/40 flex items-start justify-center px-4"
      style={{ paddingTop: "18vh" }}
      onClick={onClose}
    >
      <div className="w-full max-w-[640px] panel shadow-pop overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 h-[52px] border-b border-ink-150">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-ink-400"
            placeholder="사람·공지·일정·문서·메시지 검색…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <span className="kbd">ESC</span>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {!q.trim() ? (
            <div className="py-12 text-center t-caption">원하는 항목을 검색해보세요.</div>
          ) : loading ? (
            <div className="py-12 text-center t-caption">검색 중…</div>
          ) : totalCount === 0 ? (
            <div className="py-12 text-center">
              <div className="text-[13px] font-bold text-ink-800">결과가 없어요</div>
              <div className="text-[11px] text-ink-500 mt-1">다른 키워드로 다시 검색해보세요.</div>
            </div>
          ) : (
            <div className="py-2">
              {results.people && results.people.length > 0 && (
                <Section label="사람">
                  {results.people.map((p: any) => (
                    <Row key={`p-${p.id}`} onClick={() => go(`/directory`)}
                      icon={<Avatar name={p.name} color={p.avatarColor ?? "#3D54C4"} />}>
                      <div className="text-[13px] font-bold text-ink-900">{p.name}</div>
                      <div className="text-[11px] text-ink-500">{p.position ?? "—"} {p.team && `· ${p.team}`} · {p.email}</div>
                    </Row>
                  ))}
                </Section>
              )}
              {results.notices && results.notices.length > 0 && (
                <Section label="공지">
                  {results.notices.map((n: any) => (
                    <Row key={`n-${n.id}`} onClick={() => go(`/notice`)}
                      icon={<SmallBadge color="#DC2626">📢</SmallBadge>}>
                      <div className="text-[13px] font-bold text-ink-900 truncate">{n.title}</div>
                      <div className="text-[11px] text-ink-500 line-clamp-1">{n.content}</div>
                    </Row>
                  ))}
                </Section>
              )}
              {results.events && results.events.length > 0 && (
                <Section label="일정">
                  {results.events.map((e: any) => (
                    <Row key={`e-${e.id}`} onClick={() => go(`/schedule`)}
                      icon={<SmallBadge color={e.color ?? "#3D54C4"}>📅</SmallBadge>}>
                      <div className="text-[13px] font-bold text-ink-900 truncate">{e.title}</div>
                      <div className="text-[11px] text-ink-500 tabular">
                        {new Date(e.startAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </Row>
                  ))}
                </Section>
              )}
              {results.documents && results.documents.length > 0 && (
                <Section label="문서">
                  {results.documents.map((d: any) => (
                    <Row key={`d-${d.id}`} onClick={() => go(`/documents`)}
                      icon={<SmallBadge color="#0EA5E9">📄</SmallBadge>}>
                      <div className="text-[13px] font-bold text-ink-900 truncate">{d.title}</div>
                      <div className="text-[11px] text-ink-500 truncate">{d.folder?.name ?? "루트"} · {d.author?.name}</div>
                    </Row>
                  ))}
                </Section>
              )}
              {results.messages && results.messages.length > 0 && (
                <Section label="메시지">
                  {results.messages.map((m: any) => (
                    <Row key={`m-${m.id}`} onClick={() => go(`/chat?room=${m.room.id}`)}
                      icon={<Avatar name={m.sender.name} color={m.sender.avatarColor} />}>
                      <div className="text-[13px] font-bold text-ink-900 truncate">{m.sender.name} <span className="text-ink-500 font-medium">· {m.room.name}</span></div>
                      <div className="text-[11px] text-ink-500 line-clamp-1">{m.content}</div>
                    </Row>
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-5 py-1.5 text-[10px] font-extrabold text-ink-500 uppercase tracking-[0.08em]">{label}</div>
      {children}
    </div>
  );
}

function Row({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-ink-25 text-left">
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B0B8C1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

function Avatar({ name, color }: { name: string; color: string }) {
  return (
    <div className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px] font-bold" style={{ background: color, letterSpacing: "-0.02em" }}>
      {name?.[0] ?? "?"}
    </div>
  );
}

function SmallBadge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="w-7 h-7 rounded-md grid place-items-center" style={{ background: color + "20", color }}>
      {children}
    </div>
  );
}
