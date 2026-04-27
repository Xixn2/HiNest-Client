import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import PageHeader from "../components/PageHeader";
import SuperStepUpGate from "../components/SuperStepUpGate";

type Log = {
  id: string;
  action: string;
  target?: string | null;
  detail?: string | null;
  ip?: string | null;
  createdAt: string;
  user?: { name: string; email: string } | null;
};

type RoomMember = { user: { id: string; name: string; avatarColor: string } };
type Room = {
  id: string;
  name: string;
  type: "GROUP" | "DIRECT" | "TEAM";
  createdAt: string;
  members: RoomMember[];
  messages: { content: string; createdAt: string }[];
};
type Message = {
  id: string;
  content: string;
  kind: "TEXT" | "IMAGE" | "VIDEO" | "FILE";
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  scheduledAt?: string | null;
  createdAt: string;
  sender: { id: string; name: string; avatarColor: string; avatarUrl?: string | null };
};

type Tab = "logs" | "chat" | "api" | "console" | "server";

type ApiSpecRoute = {
  method: string;
  path: string;
  auth: "PUBLIC" | "AUTH" | "ADMIN" | "SUPER";
  middlewares: string[];
};

export default function SuperAdminPage() {
  return (
    <div>
      <PageHeader
        eyebrow="관리 › 총관리자"
        title="총관리자 콘솔"
        description="시스템 전반의 활동 로그와 모든 대화를 조회할 수 있습니다."
      />
      <SuperStepUpGate>
        <SuperAdminContent />
      </SuperStepUpGate>
    </div>
  );
}

function SuperAdminContent() {
  // 새로고침 유지 — URL 쿼리로 탭 동기화.
  const [sp, setSp] = useSearchParams();
  const raw = sp.get("tab");
  const tab: Tab =
    raw === "chat" ? "chat"
    : raw === "api" ? "api"
    : raw === "console" ? "console"
    : raw === "server" ? "server"
    : "logs";
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(sp);
    if (t === "logs") next.delete("tab");
    else next.set("tab", t);
    setSp(next, { replace: true });
  };
  return (
    <>
      <div className="flex items-center gap-1 mb-4 border-b border-ink-150">
        <TabBtn active={tab === "logs"} onClick={() => setTab("logs")}>활동 로그</TabBtn>
        <TabBtn active={tab === "chat"} onClick={() => setTab("chat")}>사내톡 감사</TabBtn>
        <TabBtn active={tab === "api"} onClick={() => setTab("api")}>API 명세</TabBtn>
        <TabBtn active={tab === "console"} onClick={() => setTab("console")}>콘솔</TabBtn>
        <TabBtn active={tab === "server"} onClick={() => setTab("server")}>서버 로그</TabBtn>
      </div>
      {tab === "logs" && <LogsPanel />}
      {tab === "chat" && <ChatAuditPanel />}
      {tab === "api" && <ApiSpecPanel />}
      {tab === "console" && <ConsolePanel />}
      {tab === "server" && <ServerLogsPanel />}
    </>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 h-[36px] text-[13px] font-semibold transition ${
        active ? "text-ink-900" : "text-ink-500 hover:text-ink-800"
      }`}
    >
      {children}
      {active && <span className="absolute -bottom-px left-2 right-2 h-[2px] bg-brand-500 rounded-full" />}
    </button>
  );
}

/* =============== 활동 로그 =============== */
function LogsPanel() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [q, setQ] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  // 500개 로그를 필터할 때 한글 IME 입력이 끊기지 않도록 우선순위 낮춰 실행.
  const deferredQ = useDeferredValue(q);

  // 언마운트 후 setState 호출 방지 + 새로고침 버튼 연타 시 stale 응답 폐기.
  const aliveRef = useRef(true);
  const tokenRef = useRef(0);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  async function load() {
    const myToken = ++tokenRef.current;
    const res = await api<{ logs: Log[] }>("/api/admin/logs?limit=500");
    if (!aliveRef.current || myToken !== tokenRef.current) return;
    setLogs(res.logs);
  }

  useEffect(() => {
    load();
  }, []);

  const uniqueActions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs]);

  const filtered = useMemo(() => {
    let arr = logs;
    if (actionFilter) arr = arr.filter((l) => l.action === actionFilter);
    const keyword = deferredQ.trim().toLowerCase();
    if (keyword) {
      arr = arr.filter((l) =>
        [l.action, l.target, l.detail, l.user?.name, l.user?.email]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(keyword))
      );
    }
    return arr;
  }, [logs, actionFilter, deferredQ]);

  return (
    <div className="panel p-0 overflow-hidden">
      <div className="section-head flex-wrap">
        <div className="title">
          활동 로그 <span className="text-ink-400 font-medium ml-1 tabular">{filtered.length}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input text-[12px] h-[30px] w-full sm:w-[160px]" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">모든 액션</option>
            {uniqueActions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            className="input text-[12px] h-[30px] w-full sm:w-[200px]"
            placeholder="검색 (이름·대상·상세)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={80}
          />
          <button className="btn-ghost btn-xs" onClick={load}>새로고침</button>
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="pro" style={{ minWidth: 820 }}>
        <thead>
          <tr>
            <th>시각</th>
            <th>사용자</th>
            <th>액션</th>
            <th>대상</th>
            <th>상세</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((l) => (
            <tr key={l.id}>
              <td className="tabular text-[11px] text-ink-600">{new Date(l.createdAt).toLocaleString("ko-KR")}</td>
              <td>{l.user?.name ?? "—"}</td>
              <td><span className="chip-gray tabular">{l.action}</span></td>
              <td className="tabular text-[11px] text-ink-600 max-w-[180px] truncate" title={l.target ?? ""}>{l.target ?? "—"}</td>
              <td className="text-[11px] text-ink-600 max-w-[280px] truncate" title={l.detail ?? ""}>{l.detail ?? "—"}</td>
              <td className="tabular text-[11px] text-ink-500">{l.ip ?? "—"}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: "center", padding: "40px 0" }} className="t-caption">
                로그가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* =============== 사내톡 감사 =============== */
function ChatAuditPanel() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [active, setActive] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<"all" | "direct" | "group">("all");
  const [q, setQ] = useState("");
  // 방 리스트 필터는 수백개 수준에서 한 번에 일어나므로 deferred 로 스케줄 낮춤.
  const deferredQ = useDeferredValue(q);

  // 방 전환 중 이전 요청이 늦게 돌아오면 새 방의 메시지를 덮어써버리는 race 가 있어,
  // activeIdRef 로 현재 의도한 방을 기억해두고 응답이 stale 이면 버림.
  const activeIdRef = useRef<string | null>(null);
  // 언마운트 후 setState 방지. loadRooms 는 exit 시점에 오래 걸릴 수도 있음.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  async function loadRooms() {
    const res = await api<{ rooms: Room[] }>("/api/chat/rooms?scope=audit");
    if (!aliveRef.current) return;
    setRooms(res.rooms);
    // setActive 는 함수형 업데이트로 — loadRooms 진행 중에 유저가 방을 바꿨다면 덮어쓰지 않음.
    setActive((prev) => prev ?? res.rooms[0] ?? null);
  }
  async function loadMessages(roomId: string) {
    activeIdRef.current = roomId;
    const res = await api<{ messages: Message[] }>(`/api/chat/rooms/${roomId}/messages`);
    if (!aliveRef.current) return;
    if (activeIdRef.current !== roomId) return; // 방이 바뀌었으면 stale 응답 무시
    setMessages(res.messages);
  }
  useEffect(() => { loadRooms(); }, []);
  useEffect(() => { if (active) loadMessages(active.id); }, [active?.id]);

  const visible = useMemo(() => {
    let arr = rooms;
    if (filter === "direct") arr = arr.filter((r) => r.type === "DIRECT");
    if (filter === "group") arr = arr.filter((r) => r.type !== "DIRECT");
    const k = deferredQ.trim().toLowerCase();
    if (k) {
      arr = arr.filter((r) =>
        r.name.toLowerCase().includes(k) ||
        r.members.some((m) => m.user.name.toLowerCase().includes(k))
      );
    }
    return arr;
  }, [rooms, filter, deferredQ]);

  function roomLabel(r: Room) {
    if (r.type === "DIRECT") {
      const names = r.members.map((m) => m.user.name);
      return names.join(" ↔ ");
    }
    return r.name;
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[12px]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
        <span className="font-semibold">모든 DM·팀·그룹 대화가 조회되며 조회 기록이 AuditLog 에 남습니다.</span>
      </div>

      <div className="panel p-0 overflow-hidden" style={{ height: "calc(100vh - 280px)" }}>
        <div className="flex h-full">
          <div className={`${active ? "hidden md:flex" : "flex w-full"} md:w-[320px] border-r border-ink-150 flex-col`}>
            <div className="p-3 border-b border-ink-150 space-y-2">
              <input className="input text-[12px] h-[32px]" placeholder="방·참가자 검색" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
              <div className="flex items-center gap-1">
                {(["all", "direct", "group"] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-2.5 h-[26px] text-[11px] font-semibold rounded-md ${filter === f ? "bg-ink-100 text-ink-900" : "text-ink-500 hover:text-ink-800"}`}>
                    {f === "all" ? "전체" : f === "direct" ? "1:1" : "그룹/팀"}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-ink-400 tabular">{visible.length}</span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {visible.map((r) => (
                <button key={r.id} onClick={() => setActive(r)}
                  className={`w-full text-left px-3 py-2.5 border-b border-ink-100 hover:bg-ink-25 ${active?.id === r.id ? "bg-brand-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <RoomTypeChip type={r.type} />
                    <div className="text-[13px] font-semibold text-ink-900 truncate flex-1">{roomLabel(r)}</div>
                  </div>
                  <div className="text-[11px] text-ink-500 mt-1 truncate">
                    {r.messages[0]?.content ?? `${r.members.length}명 참여`}
                  </div>
                  <div className="text-[10px] text-ink-400 mt-0.5 tabular">
                    생성일 {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                  </div>
                </button>
              ))}
              {visible.length === 0 && <div className="px-4 py-12 text-center t-caption">조건에 맞는 대화가 없습니다.</div>}
            </div>
          </div>

          <div className={`${active ? "flex" : "hidden md:flex"} flex-1 flex-col min-w-0`}>
            {active ? (
              <>
                <div className="h-[52px] px-5 border-b border-ink-150 flex items-center justify-between bg-ink-25">
                  <div className="min-w-0 flex items-center gap-2">
                    <button
                      type="button"
                      className="md:hidden btn-icon"
                      onClick={() => setActive(null)}
                      aria-label="목록으로"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <RoomTypeChip type={active.type} />
                      <div className="text-[14px] font-bold text-ink-900 truncate">{roomLabel(active)}</div>
                      <span className="chip-amber">READ ONLY</span>
                    </div>
                    <div className="text-[11px] text-ink-500 mt-0.5 truncate">
                      참가자 {active.members.length}명 · {active.members.map((m) => m.user.name).join(", ")}
                    </div>
                    </div>
                  </div>
                  <button className="btn-ghost btn-xs" onClick={() => active && loadMessages(active.id)}>새로고침</button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-2 bg-ink-25">
                  {messages.length === 0 && (
                    <div className="h-full grid place-items-center"><div className="t-caption">메시지가 없습니다.</div></div>
                  )}
                  {messages.map((m) => {
                    const deleted = !!m.deletedAt;
                    const scheduled = !!m.scheduledAt && new Date(m.scheduledAt).getTime() > Date.now();
                    return (
                      <div key={m.id} className="flex gap-2">
                        <div className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px] font-bold flex-shrink-0 overflow-hidden"
                          style={{ background: m.sender.avatarUrl ? "transparent" : m.sender.avatarColor }}>
                          {m.sender.avatarUrl ? (
                            <img src={m.sender.avatarUrl} alt={m.sender.name} className="w-full h-full object-cover" />
                          ) : (
                            m.sender.name[0]
                          )}
                        </div>
                        <div className="max-w-[72%]">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[11px] font-semibold text-ink-700">{m.sender.name}</span>
                            <span className="text-[10px] text-ink-400 tabular">
                              {new Date(m.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {m.editedAt && <span className="text-[10px] text-ink-500">편집됨</span>}
                            {deleted && <span className="chip-red">삭제됨</span>}
                            {scheduled && <span className="chip-amber">예약</span>}
                          </div>
                          <div className={`inline-block px-3 py-1.5 rounded-lg text-[13px] whitespace-pre-wrap ${
                            deleted
                              ? "bg-ink-100 text-ink-500 italic line-through"
                              : "bg-white border border-ink-150 text-ink-900"
                          }`}>
                            <AuditAttachment msg={m} />
                            {m.content || (m.fileName ? "" : "(빈 메시지)")}
                            {scheduled && (
                              <div className="mt-1 text-[10px] text-amber-700">
                                ⏱ {new Date(m.scheduledAt!).toLocaleString("ko-KR")} 발송 예정
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex-1 grid place-items-center"><div className="t-caption">좌측에서 대화방을 선택하세요.</div></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditAttachment({ msg }: { msg: Message }) {
  if (!msg.fileUrl) return null;
  if (msg.kind === "IMAGE") return <img src={msg.fileUrl} alt={msg.fileName ?? ""} loading="lazy" decoding="async" className="max-h-56 rounded mb-1" />;
  if (msg.kind === "VIDEO") return <video src={msg.fileUrl} controls className="max-h-56 rounded mb-1" />;
  return (
    <a href={msg.fileUrl} target="_blank" rel="noreferrer"
      className="flex items-center gap-2 p-2 rounded-md mb-1 bg-ink-50 border border-ink-200 no-underline">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      </svg>
      <span className="text-[12px] font-semibold">{msg.fileName}</span>
      <span className="text-[10px] text-ink-500 tabular">{humanSize(msg.fileSize ?? 0)}</span>
    </a>
  );
}

function RoomTypeChip({ type }: { type: Room["type"] }) {
  if (type === "DIRECT") return <span className="chip-brand">DM</span>;
  if (type === "TEAM") return <span className="chip-blue">TEAM</span>;
  return <span className="chip-gray">GROUP</span>;
}

function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/* =============== API 명세 =============== */
function ApiSpecPanel() {
  const [routes, setRoutes] = useState<ApiSpecRoute[]>([]);
  const [q, setQ] = useState("");
  const [authFilter, setAuthFilter] = useState<"" | ApiSpecRoute["auth"]>("");
  const [methodFilter, setMethodFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    api<{ routes: ApiSpecRoute[]; total: number }>("/api/admin/api-spec")
      .then((r) => {
        if (!aliveRef.current) return;
        setRoutes(r.routes);
      })
      .catch((e) => { if (aliveRef.current) setErr(e?.message ?? "불러오기 실패"); })
      .finally(() => { if (aliveRef.current) setLoading(false); });
  }, []);

  // path 의 첫 segment 로 그룹핑(예: /api/snippet → \"api/snippet\").
  // 두 번째 segment까지 묶으면 그룹이 너무 잘게 쪼개져서 /api/<리소스> 단위로 통일.
  const grouped = useMemo(() => {
    const filtered = routes.filter((r) => {
      if (authFilter && r.auth !== authFilter) return false;
      if (methodFilter && r.method !== methodFilter) return false;
      if (q) {
        const k = q.toLowerCase();
        if (!r.path.toLowerCase().includes(k) && !r.method.toLowerCase().includes(k)) return false;
      }
      return true;
    });
    const map = new Map<string, ApiSpecRoute[]>();
    for (const r of filtered) {
      const segs = r.path.split("/").filter(Boolean);
      const key = segs.length >= 2 ? `/${segs[0]}/${segs[1]}` : `/${segs[0] ?? ""}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [routes, q, authFilter, methodFilter]);

  if (loading) return <div className="panel p-8 text-center text-ink-500 text-[13px]">불러오는 중…</div>;
  if (err) return <div className="panel p-6 text-red-600 text-[13px]">{err}</div>;

  const totalShown = grouped.reduce((acc, [, list]) => acc + list.length, 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input flex-1 min-w-[220px]"
          placeholder="path 또는 method 검색 — 예: /chat, GET"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input !w-auto" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
          <option value="">메소드 전체</option>
          {["GET", "POST", "PATCH", "PUT", "DELETE"].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="input !w-auto" value={authFilter} onChange={(e) => setAuthFilter(e.target.value as any)}>
          <option value="">권한 전체</option>
          <option value="PUBLIC">PUBLIC</option>
          <option value="AUTH">AUTH</option>
          <option value="ADMIN">ADMIN</option>
          <option value="SUPER">SUPER</option>
        </select>
        <div className="text-[11px] text-ink-500">
          총 <b className="text-ink-800">{routes.length}</b> 개 · 표시 <b className="text-ink-800">{totalShown}</b>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div className="panel p-10 text-center text-ink-500 text-[13px]">조건에 맞는 라우트가 없어요</div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([groupKey, list]) => (
            <div key={groupKey} className="panel p-0 overflow-hidden">
              <div className="px-3 py-2 bg-ink-25 border-b border-ink-150 flex items-center justify-between">
                <div className="text-[12.5px] font-bold text-ink-800 font-mono">{groupKey}</div>
                <div className="text-[11px] text-ink-500">{list.length}개</div>
              </div>
              <ul className="divide-y divide-ink-100">
                {list.map((r) => (
                  <li key={`${r.method} ${r.path}`} className="px-3 py-2 flex items-center gap-3">
                    <MethodChip method={r.method} />
                    <code className="flex-1 min-w-0 text-[12.5px] font-mono text-ink-900 truncate">{r.path}</code>
                    <AuthChip auth={r.auth} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MethodChip({ method }: { method: string }) {
  const tone =
    method === "GET" ? "chip-blue"
    : method === "POST" ? "chip-green"
    : method === "PATCH" || method === "PUT" ? "chip-amber"
    : method === "DELETE" ? "chip-red"
    : "chip-gray";
  return <span className={`chip ${tone} font-mono`} style={{ minWidth: 56, justifyContent: "center" }}>{method}</span>;
}

/* =============== 콘솔 — 명령어로 권한·계정 제어 =============== */
type ConsoleEntry =
  | { kind: "input"; text: string; ts: number }
  | { kind: "output"; text: string; ok: boolean; ts: number };

/** 명령어 트리 — 토큰 위치별로 다음에 올 수 있는 후보. 'arg:user' 같이 prefix 가
 *  arg: 인 항목은 정적 후보가 아니라 동적 fetch 컨텍스트 (서버 자동완성). */
const CMD_TREE: Record<string, any> = {
  help: {},
  "?": {},
  whoami: {},
  clear: {},
  cls: {},
  users: { list: { "arg:limit": {} }, find: { "arg:query": {} } },
  user: {
    info: { "arg:user": {} },
    role: { "arg:user": { MEMBER: {}, MANAGER: {}, ADMIN: {} } },
    grant: { admin: { "arg:user": {} }, super: { "arg:user": {} } },
    revoke: { admin: { "arg:user": {} }, super: { "arg:user": {} } },
    lock: { "arg:user": {} },
    unlock: { "arg:user": {} },
    resign: { "arg:user": { "arg:date": {} } },
    "reset-pw": { "arg:user": {} },
    team: { "arg:user": { "arg:team": {} } },
    position: { "arg:user": { "arg:position": {} } },
  },
  rooms: { list: { "arg:limit": {} } },
  room: { info: { "arg:roomId": {} } },
  notice: { broadcast: { "arg:text": {} } },
  system: { stats: {} },
  audit: { recent: { "arg:limit": {} } },
  cache: { evict: { user: { "arg:user": {} } } },
};

type Suggestion = {
  /** 화면에 보일 라벨 */
  label: string;
  /** 입력에 삽입될 토큰 */
  insert: string;
  /** 보조 정보 우측 노출 */
  hint?: string;
};

type CompCtx =
  | { kind: "static"; tokens: string[] } // 트리에 박힌 정적 토큰 후보
  | { kind: "user" }
  | { kind: "team" }
  | { kind: "position" };

/** input + 커서 위치를 보고 현재 토큰 + 다음 후보 컨텍스트를 결정. */
function resolveCompletion(
  input: string,
  cursor: number,
): { ctx: CompCtx; tokenStart: number; tokenEnd: number; query: string } | null {
  // 토큰 = 공백으로 잘랐을 때의 단어 단위.
  const before = input.slice(0, cursor);
  // 커서 직전 토큰 위치.
  let s = cursor;
  while (s > 0 && !/\s/.test(input[s - 1])) s--;
  const currentToken = input.slice(s, cursor);
  const completed = before.slice(0, s).trim();
  const completedTokens = completed ? completed.split(/\s+/) : [];

  // 트리를 따라 들어감.
  let node: any = CMD_TREE;
  for (const t of completedTokens) {
    // 동적 arg: 자식이면 그 자식 노드의 자식 단계로 진입 (값은 무시하고 트리만 한 칸 깊게).
    const argKey = Object.keys(node).find((k) => k.startsWith("arg:"));
    if (node[t] !== undefined) {
      node = node[t];
    } else if (argKey) {
      node = node[argKey];
    } else {
      // 알 수 없는 토큰 — 자유 입력 단계. 후보 없음.
      return null;
    }
    if (!node || typeof node !== "object") return null;
  }

  // 현재 토큰이 @ 로 시작하면 동적 컨텍스트(user/team/position) 강제.
  const atMatch = currentToken.startsWith("@");
  if (atMatch) {
    // 트리에서 arg:user|arg:team|arg:position 자식이 있는지 보고 그 컨텍스트 사용.
    const argKey = Object.keys(node).find((k) => k.startsWith("arg:"));
    let kind: CompCtx["kind"] = "user";
    if (argKey === "arg:team") kind = "team";
    else if (argKey === "arg:position") kind = "position";
    else if (argKey === "arg:user") kind = "user";
    else if (!argKey) kind = "user"; // 기본은 user (가장 자주 쓰이는 시나리오)
    return {
      ctx: { kind },
      tokenStart: s,
      tokenEnd: cursor,
      query: currentToken.slice(1),
    };
  }

  // 정적 후보 (Tab 완성).
  const keys = Object.keys(node);
  const staticKeys = keys.filter((k) => !k.startsWith("arg:"));
  // 동적 자식이 있으면 — 컨텍스트도 같이 후보로 노출.
  const argKey = keys.find((k) => k.startsWith("arg:"));
  if (staticKeys.length > 0) {
    return {
      ctx: { kind: "static", tokens: staticKeys },
      tokenStart: s,
      tokenEnd: cursor,
      query: currentToken,
    };
  }
  if (argKey === "arg:user") return { ctx: { kind: "user" }, tokenStart: s, tokenEnd: cursor, query: currentToken };
  if (argKey === "arg:team") return { ctx: { kind: "team" }, tokenStart: s, tokenEnd: cursor, query: currentToken };
  if (argKey === "arg:position") return { ctx: { kind: "position" }, tokenStart: s, tokenEnd: cursor, query: currentToken };
  return null;
}

function ConsolePanel() {
  const [history, setHistory] = useState<ConsoleEntry[]>(() => [
    {
      kind: "output",
      ok: true,
      ts: Date.now(),
      text:
        "총관리자 콘솔. `help` 로 사용법.\n" +
        "Tab — 명령어 자동완성, @ — 유저/팀/직급 자동완성.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const compRef = useRef<{ tokenStart: number; tokenEnd: number } | null>(null);
  const fetchSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // 위/아래 화살표로 이전 명령 재호출 (자동완성 닫혀있을 때만).
  const cmdHistRef = useRef<string[]>([]);
  const cmdHistIdxRef = useRef(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  // 출력이 추가되면 항상 최하단으로.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history]);

  /** input 또는 cursor 가 바뀔 때 동적 컨텍스트(@) 면 자동으로 fetch. */
  async function recomputeOpen() {
    const el = inputRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? el.value.length;
    const r = resolveCompletion(input, cursor);
    if (!r) {
      setOpen(false);
      setSuggestions([]);
      compRef.current = null;
      return;
    }
    compRef.current = { tokenStart: r.tokenStart, tokenEnd: r.tokenEnd };
    if (r.ctx.kind === "static") {
      // @ 가 아닌 경우엔 Tab 누를 때만 메뉴 노출. 자동 표시는 안 함.
      if (input.slice(r.tokenStart, r.tokenEnd).startsWith("@")) {
        // 도달 안 함, 안전망
      }
      // 자동 노출 X
      setOpen(false);
      return;
    }
    // 동적 컨텍스트 — @ 토큰일 때만 자동 fetch + 표시.
    const isAt = input.slice(r.tokenStart, r.tokenEnd).startsWith("@");
    if (!isAt) {
      setOpen(false);
      return;
    }
    const seq = ++fetchSeq.current;
    try {
      const res = await api<{ items: any[] }>(
        `/api/admin/console/complete?ctx=${r.ctx.kind}&q=${encodeURIComponent(r.query)}&limit=10`,
      );
      if (seq !== fetchSeq.current) return;
      const items: Suggestion[] = (res.items ?? []).map((it) => {
        if (r.ctx.kind === "user") {
          return {
            label: `${it.name} · ${it.email}${it.team ? ` · ${it.team}` : ""}`,
            insert: it.id,
            hint: it.role + (it.active ? "" : " (비활성)"),
          };
        }
        return { label: it.value, insert: /\s/.test(it.value) ? `"${it.value}"` : it.value };
      });
      setSuggestions(items);
      setActive(0);
      setOpen(items.length > 0);
    } catch {
      setOpen(false);
    }
  }

  // 입력 변할 때마다 컨텍스트 재계산. @ 면 자동으로 fetch+open.
  useEffect(() => {
    void recomputeOpen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  async function execute(raw: string) {
    const cmd = raw.trim();
    if (!cmd) return;
    cmdHistRef.current.push(cmd);
    cmdHistIdxRef.current = cmdHistRef.current.length;
    setHistory((h) => [...h, { kind: "input", text: cmd, ts: Date.now() }]);
    if (cmd === "clear" || cmd === "cls") {
      setHistory([]);
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; output: string }>("/api/admin/console", {
        method: "POST",
        json: { cmd },
      });
      if (!aliveRef.current) return;
      setHistory((h) => [...h, { kind: "output", ok: r.ok, text: r.output, ts: Date.now() }]);
    } catch (e: any) {
      if (!aliveRef.current) return;
      setHistory((h) => [...h, { kind: "output", ok: false, text: `요청 실패: ${e?.message ?? "unknown"}`, ts: Date.now() }]);
    } finally {
      if (aliveRef.current) setBusy(false);
    }
  }

  function applySuggestion(s: Suggestion) {
    const range = compRef.current;
    if (!range) return;
    const next = input.slice(0, range.tokenStart) + s.insert + " " + input.slice(range.tokenEnd);
    setInput(next);
    setOpen(false);
    setSuggestions([]);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      const pos = range.tokenStart + s.insert.length + 1;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  /** Tab 핸들러 — 정적/동적 후보를 즉석에서 만들어 노출. 후보 1개면 곧장 삽입. */
  async function handleTab() {
    const el = inputRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? el.value.length;
    const r = resolveCompletion(input, cursor);
    if (!r) return;
    compRef.current = { tokenStart: r.tokenStart, tokenEnd: r.tokenEnd };
    let items: Suggestion[] = [];
    if (r.ctx.kind === "static") {
      const q = r.query.toLowerCase();
      items = r.ctx.tokens
        .filter((t) => !q || t.toLowerCase().startsWith(q))
        .map((t) => ({ label: t, insert: t }));
    } else {
      try {
        const res = await api<{ items: any[] }>(
          `/api/admin/console/complete?ctx=${r.ctx.kind}&q=${encodeURIComponent(r.query)}&limit=10`,
        );
        items = (res.items ?? []).map((it) => {
          if (r.ctx.kind === "user") {
            return {
              label: `${it.name} · ${it.email}${it.team ? ` · ${it.team}` : ""}`,
              insert: it.id,
              hint: it.role + (it.active ? "" : " (비활성)"),
            };
          }
          return { label: it.value, insert: /\s/.test(it.value) ? `"${it.value}"` : it.value };
        });
      } catch {
        items = [];
      }
    }
    if (items.length === 0) return;
    if (items.length === 1) {
      applySuggestion(items[0]);
      return;
    }
    setSuggestions(items);
    setActive(0);
    setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Tab — 자동완성 트리거.
    if (e.key === "Tab") {
      e.preventDefault();
      void handleTab();
      return;
    }
    // 메뉴 열려있을 때 ↑↓/Enter/Esc 가 메뉴를 우선.
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); applySuggestion(suggestions[active]); return; }
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    }
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const v = input;
      setInput("");
      void execute(v);
    } else if (e.key === "ArrowUp") {
      const list = cmdHistRef.current;
      if (list.length === 0) return;
      e.preventDefault();
      const next = Math.max(0, cmdHistIdxRef.current - 1);
      cmdHistIdxRef.current = next;
      setInput(list[next] ?? "");
    } else if (e.key === "ArrowDown") {
      const list = cmdHistRef.current;
      if (list.length === 0) return;
      e.preventDefault();
      const next = Math.min(list.length, cmdHistIdxRef.current + 1);
      cmdHistIdxRef.current = next;
      setInput(list[next] ?? "");
    }
  }

  return (
    <div
      style={{
        background: "#0E1014",
        color: "#E5E9F0",
        borderRadius: 12,
        border: "1px solid var(--c-border)",
        overflow: "hidden",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      }}
    >
      <div
        ref={scrollRef}
        style={{
          height: "min(60vh, 540px)",
          overflowY: "auto",
          padding: "12px 14px",
          fontSize: 12.5,
          lineHeight: 1.55,
        }}
      >
        {history.map((h, i) => {
          if (h.kind === "input") {
            return (
              <div key={i} style={{ color: "#7896FF", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                <span style={{ color: "#9CA3AF", marginRight: 6 }}>$</span>
                {h.text}
              </div>
            );
          }
          return (
            <div
              key={i}
              style={{
                color: h.ok ? "#D4D8DE" : "#FCA5A5",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                marginBottom: 6,
              }}
            >
              {h.text}
            </div>
          );
        })}
        {busy && <div style={{ color: "#7F8792" }}>실행 중…</div>}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "#171A20",
          position: "relative",
        }}
      >
        {open && suggestions.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: "100%",
              marginBottom: 6,
              background: "#171A20",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              maxHeight: 240,
              overflowY: "auto",
              zIndex: 10,
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => applySuggestion(s)}
                onMouseEnter={() => setActive(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "7px 10px",
                  background: i === active ? "rgba(120,150,255,0.12)" : "transparent",
                  border: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <span style={{ color: "#E5E9F0", fontSize: 12.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.label}
                </span>
                {s.hint && <span style={{ color: "#7F8792", fontSize: 11 }}>{s.hint}</span>}
              </button>
            ))}
          </div>
        )}
        <span style={{ color: "#9CA3AF", fontSize: 13, fontWeight: 700 }}>{">"}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={busy}
          autoFocus
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Tab 자동완성 / @ 유저·팀·직급 선택 / help"
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            background: "transparent",
            color: "#E5E9F0",
            fontFamily: "inherit",
            fontSize: 13,
            padding: "4px 0",
          }}
        />
      </div>
    </div>
  );
}

/* =============== 서버 로그 — 인메모리 버퍼 폴링 =============== */
type LogLevel = "info" | "warn" | "error" | "http";
type ServerLog = { ts: number; level: LogLevel; msg: string };

function ServerLogsPanel() {
  const [logs, setLogs] = useState<ServerLog[]>([]);
  const [level, setLevel] = useState<"" | LogLevel>("");
  const [q, setQ] = useState("");
  const [follow, setFollow] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const aliveRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (level) params.set("level", level);
      if (q) params.set("q", q);
      params.set("limit", "1000");
      const r = await api<{ logs: ServerLog[] }>(`/api/admin/server-logs?${params}`);
      if (!aliveRef.current) return;
      setLogs(r.logs);
      setLoading(false);
    } catch (e: any) {
      if (!aliveRef.current) return;
      setErr(e?.message ?? "불러오기 실패");
      setLoading(false);
    }
  }

  // 검색·레벨 변경 시 즉시 reload, 그리고 follow 켜져 있으면 3초마다 자동 갱신.
  useEffect(() => {
    void load();
    if (!follow) return;
    const id = window.setInterval(load, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, q, follow]);

  // follow 켜져 있고 새 로그가 들어오면 자동으로 최하단 스크롤.
  useEffect(() => {
    if (!follow) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs, follow]);

  if (loading) return <div className="panel p-8 text-center text-ink-500 text-[13px]">불러오는 중…</div>;
  if (err) return <div className="panel p-6 text-red-600 text-[13px]">{err}</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          className="input flex-1 min-w-[220px]"
          placeholder="로그 본문 검색 — 예: error, /api/chat"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className="input !w-auto" value={level} onChange={(e) => setLevel(e.target.value as any)}>
          <option value="">레벨 전체</option>
          <option value="http">HTTP</option>
          <option value="info">INFO</option>
          <option value="warn">WARN</option>
          <option value="error">ERROR</option>
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-ink-700 cursor-pointer">
          <input
            type="checkbox"
            className="accent-brand-500"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />
          자동 갱신 (3초)
        </label>
        <button className="btn-ghost btn-xs" onClick={() => load()}>새로고침</button>
        <div className="text-[11px] text-ink-500">{logs.length}건</div>
      </div>

      <div
        ref={scrollRef}
        style={{
          background: "#0E1014",
          color: "#D4D8DE",
          borderRadius: 12,
          border: "1px solid var(--c-border)",
          padding: "10px 12px",
          height: "min(64vh, 580px)",
          overflowY: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 12,
          lineHeight: 1.55,
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: "#7F8792", textAlign: "center", padding: 32 }}>
            아직 로그가 없어요. 프로세스 재기동 후 새로 쌓인 줄만 보여요.
          </div>
        ) : (
          logs.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              <span style={{ color: "#7F8792", flexShrink: 0 }}>
                {new Date(l.ts).toISOString().slice(11, 23)}
              </span>
              <span
                style={{
                  flexShrink: 0,
                  fontWeight: 700,
                  width: 50,
                  color:
                    l.level === "error" ? "#FCA5A5"
                    : l.level === "warn" ? "#FCD34D"
                    : l.level === "http" ? "#7896FF"
                    : "#86EFAC",
                }}
              >
                {l.level.toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{l.msg}</span>
            </div>
          ))
        )}
      </div>
      <div className="text-[11px] text-ink-500 mt-2">
        프로세스 재기동(배포 등) 시 버퍼 초기화. 디스크/CloudWatch 영속화 없음 — 최근 2,000줄만 메모리에 보관.
      </div>
    </div>
  );
}

function AuthChip({ auth }: { auth: ApiSpecRoute["auth"] }) {
  if (auth === "SUPER") return <span className="chip chip-violet">SUPER</span>;
  if (auth === "ADMIN") return <span className="chip chip-orange">ADMIN</span>;
  if (auth === "AUTH") return <span className="chip chip-gray">AUTH</span>;
  return <span className="chip" style={{ background: "transparent", color: "var(--c-text-3)", border: "1px dashed var(--c-border)" }}>PUBLIC</span>;
}
