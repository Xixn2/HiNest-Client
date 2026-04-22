import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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

type Tab = "logs" | "chat";

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
  const [tab, setTab] = useState<Tab>("logs");
  return (
    <>
      <div className="flex items-center gap-1 mb-4 border-b border-ink-150">
        <TabBtn active={tab === "logs"} onClick={() => setTab("logs")}>활동 로그</TabBtn>
        <TabBtn active={tab === "chat"} onClick={() => setTab("chat")}>사내톡 감사</TabBtn>
      </div>
      {tab === "logs" && <LogsPanel />}
      {tab === "chat" && <ChatAuditPanel />}
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
