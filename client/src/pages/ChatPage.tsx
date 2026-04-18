import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { useNotifications } from "../notifications";
import PageHeader from "../components/PageHeader";
import Linkify from "../components/Linkify";
import EmojiPicker, { EmojiPopover } from "../components/EmojiPicker";
import DateTimePicker from "../components/DateTimePicker";

type RoomMember = { user: { id: string; name: string; avatarColor: string } };
type Room = {
  id: string;
  name: string;
  type: "GROUP" | "DIRECT" | "TEAM";
  members: RoomMember[];
  messages: { content: string; createdAt: string }[];
};
type Reaction = { userId: string; emoji: string; user?: { name: string } };
type Message = {
  id: string;
  content: string;
  kind: "TEXT" | "IMAGE" | "VIDEO" | "FILE";
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  mentions?: string | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  scheduledAt?: string | null;
  createdAt: string;
  sender: { id: string; name: string; avatarColor: string };
  reactions?: Reaction[];
};
type DirectoryUser = { id: string; name: string; email: string; team?: string; avatarColor?: string };
type ScheduledRow = {
  id: string; content: string; kind: string; fileName?: string | null;
  scheduledAt: string; room: { id: string; name: string; type: string };
};

type Filter = "all" | "direct" | "group";

export default function ChatPage() {
  const { user } = useAuth();
  const { items: notifItems, markRoomRead } = useNotifications();

  // 방별 미읽음 DM/MENTION 수 계산
  const roomUnread = useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of notifItems) {
      if (n.readAt) continue;
      if (n.type !== "DM" && n.type !== "MENTION") continue;
      const m = n.linkUrl?.match(/room=([^&]+)/);
      if (!m) continue;
      map[m[1]] = (map[m[1]] ?? 0) + 1;
    }
    return map;
  }, [notifItems]);
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [active, setActive] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [attachment, setAttachment] = useState<null | {
    url: string; name: string; type: string; size: number; kind: "IMAGE" | "VIDEO" | "FILE";
  }>(null);
  const [uploading, setUploading] = useState(false);
  const [modal, setModal] = useState<"none" | "group" | "direct" | "scheduled">("none");
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [newGroup, setNewGroup] = useState({ name: "", memberIds: [] as string[] });
  const [dmTarget, setDmTarget] = useState<string | null>(null);
  const [dmSearch, setDmSearch] = useState("");
  const [search, setSearch] = useState("");
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [mentionQ, setMentionQ] = useState<string | null>(null); // null 이면 팝오버 닫힘
  const [mentionIdx, setMentionIdx] = useState(0);
  const [composerEmojiOpen, setComposerEmojiOpen] = useState(false);
  const [reactTargetId, setReactTargetId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiBtnRef = useRef<HTMLButtonElement>(null);
  const reactAnchorRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  async function loadRooms() {
    const res = await api<{ rooms: Room[] }>("/api/chat/rooms");
    setRooms(res.rooms);
    if (!active && res.rooms.length) setActive(res.rooms[0]);
    else if (active && !res.rooms.find((r) => r.id === active.id)) setActive(res.rooms[0] ?? null);
  }

  async function loadMessages(roomId: string) {
    const res = await api<{ messages: Message[] }>(`/api/chat/rooms/${roomId}/messages`);
    setMessages(res.messages);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 99999 }), 50);
  }

  async function loadDirectory() {
    const res = await api<{ users: DirectoryUser[] }>("/api/users");
    setDirectory(res.users);
  }

  async function loadScheduled() {
    const res = await api<{ scheduled: ScheduledRow[] }>("/api/chat/scheduled");
    setScheduled(res.scheduled);
  }

  useEffect(() => { loadRooms(); loadDirectory(); loadScheduled(); }, []);

  // ?room= 쿼리 지원 — DirectoryPage 등에서 특정 DM/방으로 진입
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const target = qs.get("room");
    if (!target || rooms.length === 0) return;
    const matched = rooms.find((r) => r.id === target);
    if (matched && matched.id !== active?.id) {
      setActive(matched);
      // URL 정리 (쿼리 제거)
      navigate("/chat", { replace: true });
    }
    // eslint-disable-next-line
  }, [rooms, location.search]);

  useEffect(() => { if (active) loadMessages(active.id); /* eslint-disable-next-line */ }, [active?.id]);
  useEffect(() => { if (active) markRoomRead(active.id); /* eslint-disable-next-line */ }, [active?.id]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { loadMessages(active.id); loadScheduled(); }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [active?.id]);

  async function uploadFile(f: File) {
    if (f.size > 100 * 1024 * 1024) return alert("파일은 100MB 이하만 업로드 가능합니다");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "업로드 실패");
      const json = await res.json();
      setAttachment({ url: json.url, name: json.name, type: json.type, size: json.size, kind: json.kind });
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  async function send(e?: React.SyntheticEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (sendingRef.current) return; // 중복 전송 방지 (Enter + form submit 동시 발화 등)
    if (!active) return;
    if (!input.trim() && !attachment) return;
    sendingRef.current = true;
    setSending(true);

    const payload: any = { content: input, kind: attachment ? attachment.kind : "TEXT" };
    if (attachment) {
      payload.fileUrl = attachment.url;
      payload.fileName = attachment.name;
      payload.fileType = attachment.type;
      payload.fileSize = attachment.size;
    }
    if (scheduleAt) payload.scheduledAt = new Date(scheduleAt).toISOString();
    if (mentionIds.length) payload.mentions = Array.from(new Set(mentionIds));

    try {
      await api(`/api/chat/rooms/${active.id}/messages`, { method: "POST", json: payload });
      setInput("");
      setAttachment(null);
      setScheduleAt("");
      setShowSchedule(false);
      setMentionIds([]);
      loadMessages(active.id);
      loadScheduled();
    } catch (err: any) {
      alert(err?.message ?? "전송 실패");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function startEdit(m: Message) { setEditingId(m.id); setEditingText(m.content); }
  async function saveEdit() {
    if (!editingId) return;
    await api(`/api/chat/messages/${editingId}`, { method: "PATCH", json: { content: editingText } });
    setEditingId(null);
    setEditingText("");
    if (active) loadMessages(active.id);
  }
  async function deleteMsg(m: Message) {
    if (!confirm("이 메시지를 삭제할까요?")) return;
    await api(`/api/chat/messages/${m.id}`, { method: "DELETE" });
    if (active) loadMessages(active.id);
    loadScheduled();
  }
  async function cancelScheduled(id: string) {
    if (!confirm("예약을 취소할까요?")) return;
    await api(`/api/chat/messages/${id}`, { method: "DELETE" });
    loadScheduled();
    if (active) loadMessages(active.id);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    try {
      await api(`/api/chat/messages/${messageId}/reactions`, {
        method: "POST",
        json: { emoji },
      });
      if (active) loadMessages(active.id);
    } catch (e: any) {
      alert(e?.message ?? "반응 실패");
    }
  }

  function insertAtCursor(text: string) {
    const el = textareaRef.current;
    if (!el) { setInput((p) => p + text); return; }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  }

  // @멘션 감지: 커서 앞의 @뒤 문자열 추출
  function detectMention(value: string, cursor: number): string | null {
    const before = value.slice(0, cursor);
    const m = before.match(/(?:^|\s)@([\p{L}\p{N}_.-]{0,20})$/u);
    return m ? m[1] : null;
  }

  function onComposerChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const cursor = e.target.selectionStart ?? 0;
    const q = detectMention(e.target.value, cursor);
    setMentionQ(q);
    setMentionIdx(0);
  }

  function pickMention(user: DirectoryUser) {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, cursor);
    const rest = el.value.slice(cursor);
    const replaced = before.replace(/@([\p{L}\p{N}_.-]{0,20})$/u, `@${user.name} `);
    const next = replaced + rest;
    setInput(next);
    setMentionIds((xs) => Array.from(new Set([...xs, user.id])));
    setMentionQ(null);
    requestAnimationFrame(() => {
      el.focus();
      const pos = replaced.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const activeMembers = useMemo(
    () => active?.members.map((m) => m.user).filter((u) => u.id !== user?.id) ?? [],
    [active, user?.id]
  );
  const mentionCandidates = useMemo(() => {
    if (mentionQ === null) return [] as typeof activeMembers;
    const k = (mentionQ ?? "").toLowerCase();
    const arr = activeMembers.filter((m) => !k || m.name.toLowerCase().includes(k));
    return arr.slice(0, 6);
  }, [mentionQ, activeMembers]);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (newGroup.memberIds.length === 0) return alert("멤버를 선택해주세요");
    const res = await api<{ room: Room }>("/api/chat/rooms", {
      method: "POST",
      json: { type: "GROUP", name: newGroup.name, memberIds: newGroup.memberIds },
    });
    setModal("none");
    setNewGroup({ name: "", memberIds: [] });
    await loadRooms();
    setActive(res.room);
  }
  async function createDM() {
    if (!dmTarget) return;
    const res = await api<{ room: Room }>("/api/chat/rooms", {
      method: "POST",
      json: { type: "DIRECT", memberIds: [dmTarget] },
    });
    setModal("none");
    setDmTarget(null);
    setDmSearch("");
    await loadRooms();
    setActive(res.room);
  }

  const visibleRooms = useMemo(() => {
    let arr = rooms;
    if (filter === "direct") arr = arr.filter((r) => r.type === "DIRECT");
    if (filter === "group") arr = arr.filter((r) => r.type !== "DIRECT");
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((r) => {
        const label =
          r.type === "DIRECT"
            ? (r.members.find((m) => m.user.id !== user?.id)?.user.name ?? "")
            : r.name;
        return label.toLowerCase().includes(q);
      });
    }
    return arr;
  }, [rooms, filter, search, user?.id]);

  function roomDisplayName(r: Room) {
    if (r.type === "DIRECT") {
      const other = r.members.find((m) => m.user.id !== user?.id)?.user;
      return other?.name ?? "1:1 대화";
    }
    return r.name;
  }
  function roomSubtitle(r: Room) {
    if (r.type === "DIRECT") return "1:1 대화";
    return `${r.members.length}명 · ${r.type === "TEAM" ? "팀" : "그룹"}`;
  }

  // 날짜 구분자
  const groupedMessages = useMemo(() => {
    const groups: { date: string; messages: Message[] }[] = [];
    for (const m of messages) {
      const d = new Date(m.createdAt);
      const dateKey = d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
      const last = groups[groups.length - 1];
      if (last && last.date === dateKey) last.messages.push(m);
      else groups.push({ date: dateKey, messages: [m] });
    }
    return groups;
  }, [messages]);

  return (
    <div>
      <PageHeader
        eyebrow="커뮤니케이션"
        title="사내톡"
        description="1:1 대화와 그룹·팀 채팅. 파일·사진·영상·예약 메시지 지원."
        right={
          <div className="flex items-center gap-2">
            <button className="btn-ghost" onClick={() => setModal("scheduled")}>
              <ScheduleIcon /> 예약 <span className="ml-0.5 tabular text-ink-500">{scheduled.length}</span>
            </button>
            <button className="btn-ghost" onClick={() => setModal("direct")}>
              <DmIcon /> 새 1:1
            </button>
            <button className="btn-primary" onClick={() => setModal("group")}>
              <PlusIcon /> 새 채팅방
            </button>
          </div>
        }
      />

      <div className="panel p-0 overflow-hidden" style={{ height: "calc(100vh - 220px)" }}>
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-[300px] border-r border-ink-150 flex flex-col bg-white">
            <div className="p-3 border-b border-ink-150 space-y-2">
              <div className="relative">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8E959E" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  className="input text-[12px] h-[34px] pl-9"
                  placeholder="대화방·사람 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="tabs w-full">
                {(["all", "direct", "group"] as Filter[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`tab flex-1 ${filter === f ? "tab-active" : ""}`}>
                    {f === "all" ? `전체 ${rooms.length}` : f === "direct" ? "1:1" : "그룹·팀"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {visibleRooms.map((r) => {
                const other = r.members.find((m) => m.user.id !== user?.id)?.user;
                const last = r.messages[0];
                const activeCls = active?.id === r.id;
                const unread = roomUnread[r.id] ?? 0;
                return (
                  <button key={r.id} onClick={() => setActive(r)}
                    className={`w-full text-left px-3 py-2.5 mx-1.5 my-0.5 rounded-lg transition flex items-start gap-2.5 ${
                      activeCls ? "bg-brand-50" : "hover:bg-ink-50"
                    }`}>
                    <Avatar
                      name={r.type === "DIRECT" ? (other?.name ?? "?") : r.name}
                      color={r.type === "DIRECT" ? (other?.avatarColor ?? "#3B5CF0") : "#343942"}
                      icon={r.type === "GROUP" ? "#" : r.type === "TEAM" ? "T" : undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="text-[13px] font-bold text-ink-900 truncate flex-1">{roomDisplayName(r)}</div>
                        {last && (
                          <div className="text-[10px] text-ink-400 tabular flex-shrink-0">
                            {formatRelative(new Date(last.createdAt))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className={`text-[11px] truncate flex-1 ${unread > 0 ? "text-ink-900 font-semibold" : "text-ink-500"}`}>
                          {last?.content ?? roomSubtitle(r)}
                        </div>
                        {unread > 0 && !activeCls && (
                          <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-danger text-white text-[10px] font-bold grid place-items-center tabular flex-shrink-0">
                            {unread > 99 ? "99+" : unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {visibleRooms.length === 0 && (
                <div className="px-4 py-12 text-center t-caption">대화가 없습니다.</div>
              )}
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 flex flex-col min-w-0 bg-ink-25">
            {active ? (
              <>
                <div className="h-[56px] px-5 border-b border-ink-150 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      size={32}
                      name={roomDisplayName(active)}
                      color={active.type === "DIRECT" ? active.members.find((m) => m.user.id !== user?.id)?.user.avatarColor ?? "#3B5CF0" : "#343942"}
                      icon={active.type === "GROUP" ? "#" : active.type === "TEAM" ? "T" : undefined}
                    />
                    <div className="min-w-0">
                      <div className="text-[15px] font-bold text-ink-900 truncate">{roomDisplayName(active)}</div>
                      <div className="text-[11px] text-ink-500 truncate">
                        {active.type === "DIRECT"
                          ? "1:1 대화"
                          : `${active.type === "TEAM" ? "팀 채팅" : "그룹 채팅"} · ${active.members.length}명`}
                      </div>
                    </div>
                  </div>
                </div>

                <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
                  {messages.length === 0 && (
                    <div className="h-full grid place-items-center">
                      <div className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-ink-100 grid place-items-center mb-3">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8E959E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 5h16v11H9l-4 4z" />
                          </svg>
                        </div>
                        <div className="text-[13px] font-semibold text-ink-700">아직 메시지가 없어요</div>
                        <div className="t-caption mt-1">첫 메시지를 남겨보세요.</div>
                      </div>
                    </div>
                  )}

                  {groupedMessages.map((g) => (
                    <div key={g.date}>
                      <div className="flex items-center gap-3 my-5">
                        <div className="flex-1 h-px bg-ink-150" />
                        <div className="text-[11px] font-semibold text-ink-500">{g.date}</div>
                        <div className="flex-1 h-px bg-ink-150" />
                      </div>
                      {g.messages.map((m, idx) => {
                        const mine = m.sender.id === user?.id;
                        const isEditing = editingId === m.id;
                        const deleted = !!m.deletedAt;
                        const scheduled = !!m.scheduledAt && new Date(m.scheduledAt).getTime() > Date.now();
                        const prev = g.messages[idx - 1];
                        const showHeader = !prev || prev.sender.id !== m.sender.id ||
                          new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60 * 1000;

                        return (
                          <div key={m.id} className={`group flex gap-2.5 ${mine ? "justify-end" : ""} ${showHeader ? "mt-4" : "mt-0.5"}`}>
                            {!mine && (
                              <div className="w-8 flex-shrink-0">
                                {showHeader && (
                                  <Avatar size={32} name={m.sender.name} color={m.sender.avatarColor} />
                                )}
                              </div>
                            )}
                            <div className={`max-w-[64%] min-w-0 ${mine ? "items-end" : "items-start"} flex flex-col`}>
                              {showHeader && (
                                <div className={`flex items-baseline gap-1.5 mb-1 ${mine ? "flex-row-reverse" : ""}`}>
                                  {!mine && <div className="text-[12px] font-bold text-ink-800">{m.sender.name}</div>}
                                  <div className="text-[10px] text-ink-400 tabular">
                                    {new Date(m.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}
                                  </div>
                                </div>
                              )}

                              <div className={`w-full flex ${mine ? "justify-end" : "justify-start"}`}>
                                <div className="relative max-w-full group/msg">
                                  {/* bubble */}
                                  {deleted ? (
                                    <div className="px-3.5 py-2 rounded-2xl text-[13px] italic bg-ink-100 text-ink-500">
                                      {mine ? "(내가 삭제한 메시지)" : "삭제된 메시지"}
                                    </div>
                                  ) : isEditing ? (
                                    <div className="flex flex-col gap-1.5">
                                      <textarea className="input text-[13px]" rows={2} value={editingText} onChange={(e) => setEditingText(e.target.value)} autoFocus />
                                      <div className="flex gap-1 justify-end">
                                        <button className="btn-ghost btn-xs" onClick={() => { setEditingId(null); setEditingText(""); }}>취소</button>
                                        <button className="btn-primary btn-xs" onClick={saveEdit}>저장</button>
                                      </div>
                                    </div>
                                  ) : scheduled ? (
                                    <ScheduledBubble msg={m} onCancel={() => cancelScheduled(m.id)} onEdit={() => startEdit(m)} />
                                  ) : (
                                    <div className={`inline-block px-3.5 py-2 text-[13.5px] leading-[1.5] whitespace-pre-wrap break-words ${
                                      mine
                                        ? "bg-brand-500 text-white"
                                        : "bg-white text-ink-900 border border-ink-150"
                                    }`}
                                      style={{ borderRadius: 16 }}>
                                      <Attachment msg={m} mine={mine} />
                                      <MessageBody
                                        content={m.content}
                                        mentions={(m.mentions ?? "").split(",").filter(Boolean)}
                                        mine={mine}
                                        meId={user?.id}
                                      />
                                    </div>
                                  )}

                                  {/* 호버 시 bubble 위 떠있는 액션 바 */}
                                  {!isEditing && !deleted && (
                                    <div
                                      className={`absolute z-10 opacity-0 group-hover/msg:opacity-100 transition flex items-center gap-0.5 bg-white border border-ink-200 rounded-lg shadow-flat px-0.5 -top-3.5 ${
                                        mine ? "right-0" : "left-0"
                                      }`}
                                    >
                                      {!scheduled && (
                                        <button
                                          ref={(el) => { reactAnchorRefs.current[m.id] = el; }}
                                          className="btn-icon w-[26px] h-[26px]"
                                          title="반응"
                                          onClick={() => setReactTargetId((id) => id === m.id ? null : m.id)}
                                        >
                                          <SmileIcon />
                                        </button>
                                      )}
                                      {mine && !scheduled && (
                                        <button className="btn-icon w-[26px] h-[26px]" title="수정" onClick={() => startEdit(m)}>
                                          <EditIcon />
                                        </button>
                                      )}
                                      {mine && (
                                        <button className="btn-icon w-[26px] h-[26px]" title="삭제" onClick={() => deleteMsg(m)}>
                                          <TrashIcon />
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* 연속 메시지에서 시간은 호버 시에만 좌우 바깥에 표시 */}
                                  {!showHeader && !deleted && (
                                    <div className={`absolute ${mine ? "right-full mr-2" : "left-full ml-2"} bottom-1 text-[10px] text-ink-400 tabular whitespace-nowrap opacity-0 group-hover/msg:opacity-100 transition`}>
                                      {m.editedAt && <span className="mr-1">편집됨</span>}
                                      {new Date(m.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}
                                    </div>
                                  )}
                                  {showHeader && m.editedAt && !deleted && (
                                    <div className={`text-[10px] text-ink-400 mt-0.5 ${mine ? "text-right" : ""}`}>편집됨</div>
                                  )}

                                  {/* 리액션 바 (bubble 바로 아래) */}
                                  {!deleted && m.reactions && m.reactions.length > 0 && (
                                    <div className={`mt-1 flex ${mine ? "justify-end" : "justify-start"}`}>
                                      <ReactionRow
                                        reactions={m.reactions}
                                        meId={user?.id}
                                        onToggle={(emoji) => toggleReaction(m.id, emoji)}
                                        mine={mine}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>

                {/* Composer */}
                <div className="border-t border-ink-150 p-3 bg-white">
                  {attachment && (
                    <div className="mb-2 flex items-center gap-2 p-2 rounded-xl bg-ink-50 border border-ink-150">
                      <AttachmentPreview a={attachment} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-bold text-ink-900 truncate">{attachment.name}</div>
                        <div className="text-[11px] text-ink-500 tabular">{humanSize(attachment.size)} · {attachment.type}</div>
                      </div>
                      <button type="button" className="btn-icon" onClick={() => setAttachment(null)}>
                        <CloseIcon />
                      </button>
                    </div>
                  )}

                  {showSchedule && (
                    <div className="mb-2 p-3 rounded-xl bg-gradient-to-r from-amber-50 to-amber-50/40 border border-amber-200">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-500 text-white grid place-items-center">
                          <ScheduleIcon />
                        </div>
                        <div className="text-[12px] font-extrabold text-amber-900">예약 발송 설정</div>
                        <button type="button" className="btn-icon ml-auto" onClick={() => { setShowSchedule(false); setScheduleAt(""); }}>
                          <CloseIcon />
                        </button>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="col-span-2">
                          <DateTimePicker value={scheduleAt} onChange={setScheduleAt} />
                        </div>
                        {[
                          { label: "10분 뒤", min: 10 },
                          { label: "1시간 뒤", min: 60 },
                          { label: "내일 9시", custom: "tomorrow9" as const },
                        ].map((p) => (
                          <button
                            key={p.label}
                            type="button"
                            className="h-[34px] rounded-lg bg-white border border-amber-200 text-[11px] font-bold text-amber-800 hover:bg-amber-100"
                            onClick={() => {
                              const d = new Date();
                              if (p.custom === "tomorrow9") {
                                d.setDate(d.getDate() + 1);
                                d.setHours(9, 0, 0, 0);
                              } else {
                                d.setMinutes(d.getMinutes() + (p.min ?? 0));
                              }
                              const pad = (n: number) => String(n).padStart(2, "0");
                              setScheduleAt(
                                `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
                              );
                            }}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <form onSubmit={send} className="flex items-end gap-2">
                    <input ref={fileRef} type="file"
                      accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
                      className="hidden" />

                    {/* 통합 composer: 도구 아이콘 + textarea 를 하나의 박스로 */}
                    <div className="composer-box flex-1 relative flex items-end gap-1 px-2 py-1.5">
                      <button
                        type="button"
                        className="btn-icon w-[32px] h-[32px] flex-shrink-0"
                        title="파일 첨부"
                        onClick={() => fileRef.current?.click()}
                        disabled={uploading}
                      >
                        {uploading ? <Spinner /> : <PaperclipIcon />}
                      </button>
                      <button
                        ref={emojiBtnRef}
                        type="button"
                        className={`btn-icon w-[32px] h-[32px] flex-shrink-0 ${composerEmojiOpen ? "text-brand-600 bg-brand-50" : ""}`}
                        title="이모지"
                        onClick={() => setComposerEmojiOpen((s) => !s)}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" /><path d="M8 14c1.5 1.5 3 2 4 2s2.5-.5 4-2" />
                          <path d="M9 9h.01M15 9h.01" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`btn-icon w-[32px] h-[32px] flex-shrink-0 ${showSchedule || scheduleAt ? "text-brand-600 bg-brand-50" : ""}`}
                        title="예약 발송"
                        onClick={() => setShowSchedule((s) => !s)}
                      >
                        <ScheduleIcon />
                      </button>

                      <textarea
                        ref={textareaRef}
                        rows={1}
                        className="composer-input flex-1 min-h-[32px] max-h-[120px] resize-none leading-[20px] py-1.5 px-2 bg-transparent outline-none text-[13.5px]"
                        placeholder={scheduleAt ? "예약 발송할 메시지… (@로 멘션)" : "메시지 입력… (@로 멘션)"}
                        value={input}
                        onChange={onComposerChange}
                        onKeyDown={(e) => {
                          // 멘션 팝오버 키 처리
                          if (mentionQ !== null && mentionCandidates.length > 0) {
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setMentionIdx((i) => (i + 1) % mentionCandidates.length);
                              return;
                            }
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setMentionIdx((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length);
                              return;
                            }
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              pickMention(mentionCandidates[mentionIdx]);
                              return;
                            }
                            if (e.key === "Escape") {
                              e.preventDefault();
                              setMentionQ(null);
                              return;
                            }
                          }
                          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            send(e);
                          }
                        }}
                      />
                      {mentionQ !== null && mentionCandidates.length > 0 && (
                        <div className="absolute left-0 right-0 bottom-full mb-2 panel shadow-pop overflow-hidden z-40">
                          <div className="px-3 py-1.5 text-[10px] font-extrabold text-ink-500 uppercase tracking-[0.08em] border-b border-ink-100">
                            멘션할 팀원
                          </div>
                          {mentionCandidates.map((m, i) => (
                            <button
                              key={m.id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); pickMention(m); }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${i === mentionIdx ? "bg-brand-50" : "hover:bg-ink-25"}`}
                            >
                              <div className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px] font-bold" style={{ background: m.avatarColor }}>
                                {m.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-bold text-ink-900">@{m.name}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="submit"
                      className="btn-primary h-[40px] flex-shrink-0"
                      disabled={uploading || sending || (!input.trim() && !attachment)}
                    >
                      {sending ? "전송 중…" : scheduleAt ? "예약 전송" : "전송"}
                    </button>
                    <EmojiPopover
                      open={composerEmojiOpen}
                      anchor={emojiBtnRef}
                      placement="top-left"
                      onPick={(e) => insertAtCursor(e)}
                      onClose={() => setComposerEmojiOpen(false)}
                    />
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 grid place-items-center">
                <div className="text-center">
                  <div className="mx-auto w-14 h-14 rounded-2xl bg-brand-50 grid place-items-center mb-3">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3D54C4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 5h16v11H9l-4 4z" />
                    </svg>
                  </div>
                  <div className="text-[14px] font-bold text-ink-900">대화방을 선택하세요</div>
                  <div className="t-caption mt-1">좌측 목록에서 대화를 선택하거나, 새 채팅방을 만들어보세요.</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal === "direct" && (
        <Modal onClose={() => setModal("none")} title="새 1:1 대화">
          <input className="input mb-3" value={dmSearch} onChange={(e) => setDmSearch(e.target.value)} placeholder="이름 · 팀 · 이메일" autoFocus />
          <div className="max-h-72 overflow-auto rounded-xl border border-ink-150 divide-y divide-ink-100">
            {directory.filter((d) => d.id !== user?.id).filter((d) => {
              const q = dmSearch.trim().toLowerCase();
              if (!q) return true;
              return d.name.toLowerCase().includes(q) || d.email.toLowerCase().includes(q) || (d.team ?? "").toLowerCase().includes(q);
            }).map((d) => (
              <button key={d.id} onClick={() => setDmTarget(d.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-ink-25 text-left ${dmTarget === d.id ? "bg-brand-50" : ""}`}>
                <Avatar name={d.name} color={d.avatarColor ?? "#3D54C4"} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-ink-900">{d.name}</div>
                  <div className="text-[11px] text-ink-500 truncate">{d.team ? `${d.team} · ` : ""}{d.email}</div>
                </div>
                {dmTarget === d.id && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3D54C4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5L20 7" />
                  </svg>
                )}
              </button>
            ))}
            {directory.filter((d) => d.id !== user?.id).length === 0 && (
              <div className="px-4 py-8 text-center t-caption">대화할 상대가 없습니다.</div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button className="btn-ghost" onClick={() => setModal("none")}>취소</button>
            <button className="btn-primary" disabled={!dmTarget} onClick={createDM}>대화 시작</button>
          </div>
        </Modal>
      )}

      {modal === "group" && (
        <Modal onClose={() => setModal("none")} title="새 그룹 채팅방">
          <form onSubmit={createGroup} className="space-y-3">
            <div>
              <label className="field-label">방 이름</label>
              <input className="input" value={newGroup.name} onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                placeholder="예: 2026 Q2 프로젝트, 프론트엔드팀" required />
            </div>
            <div>
              <label className="field-label">멤버 선택 <span className="text-ink-500 font-normal">({newGroup.memberIds.length}명)</span></label>
              <div className="max-h-60 overflow-auto rounded-xl border border-ink-150 divide-y divide-ink-100">
                {directory.filter((d) => d.id !== user?.id).map((d) => {
                  const checked = newGroup.memberIds.includes(d.id);
                  return (
                    <label key={d.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${checked ? "bg-brand-50" : "hover:bg-ink-25"}`}>
                      <input type="checkbox" className="accent-brand-500"
                        checked={checked}
                        onChange={(e) => setNewGroup((n) => e.target.checked ? { ...n, memberIds: [...n.memberIds, d.id] } : { ...n, memberIds: n.memberIds.filter((x) => x !== d.id) })} />
                      <Avatar name={d.name} color={d.avatarColor ?? "#3D54C4"} size={30} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-bold text-ink-900">{d.name}</div>
                        <div className="text-[11px] text-ink-500 truncate">{d.team ? `${d.team} · ` : ""}{d.email}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost" onClick={() => setModal("none")}>취소</button>
              <button className="btn-primary">만들기</button>
            </div>
          </form>
        </Modal>
      )}

      {/* 메시지 반응 이모지 피커 */}
      {reactTargetId && (
        <EmojiPopover
          open={!!reactTargetId}
          anchor={{ current: reactAnchorRefs.current[reactTargetId] ?? null } as any}
          placement="top-right"
          onPick={(e) => {
            const id = reactTargetId;
            setReactTargetId(null);
            if (id) toggleReaction(id, e);
          }}
          onClose={() => setReactTargetId(null)}
        />
      )}

      {modal === "scheduled" && (
        <Modal onClose={() => setModal("none")} title={`예약 메시지 ${scheduled.length > 0 ? `· ${scheduled.length}` : ""}`}>
          {scheduled.length === 0 ? (
            <div className="py-14 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-50 grid place-items-center mb-3">
                <div className="text-amber-600">
                  <ScheduleIcon />
                </div>
              </div>
              <div className="text-[13px] font-bold text-ink-800">예약된 메시지가 없어요</div>
              <div className="text-[12px] text-ink-500 mt-1">
                메시지 입력창의 ⏱ 버튼으로 예약 발송할 수 있어요.
              </div>
            </div>
          ) : (
            <div className="max-h-[65vh] overflow-auto -mx-1 px-1">
              {groupScheduledByDay(scheduled).map(([dayLabel, items]) => (
                <div key={dayLabel} className="mb-4 last:mb-0">
                  <div className="sticky top-0 bg-white py-1 text-[10px] font-extrabold text-ink-500 uppercase tracking-[0.08em]">
                    {dayLabel}
                  </div>
                  <div className="space-y-2">
                    {items.map((s) => {
                      const at = new Date(s.scheduledAt);
                      return (
                        <div key={s.id} className="panel p-3 border-amber-200/80 bg-gradient-to-r from-amber-50/70 to-white">
                          <div className="flex items-start gap-2.5">
                            <div className="flex flex-col items-center pt-0.5">
                              <div className="text-[18px] font-extrabold text-amber-700 tabular leading-none">
                                {at.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}
                              </div>
                              <div className="text-[10px] text-amber-600 mt-0.5">{at.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</div>
                            </div>
                            <div className="w-px self-stretch bg-amber-200" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-1">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6B7684" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4 5h16v11H9l-4 4z" />
                                </svg>
                                <div className="text-[11px] font-bold text-ink-700 truncate">{s.room.name}</div>
                              </div>
                              <div className="text-[13px] text-ink-900 whitespace-pre-wrap break-words line-clamp-3">
                                {s.content || (s.fileName ? `📎 ${s.fileName}` : "(빈 메시지)")}
                              </div>
                            </div>
                            <button
                              onClick={() => cancelScheduled(s.id)}
                              className="btn-ghost btn-xs flex-shrink-0 text-danger hover:bg-red-50 border-red-200"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* -------- Scheduled bubble -------- */
function ScheduledBubble({
  msg,
  onCancel,
  onEdit,
}: {
  msg: Message;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const at = new Date(msg.scheduledAt!);
  const countdown = useCountdown(at);

  return (
    <div
      className="inline-block max-w-full text-left"
      style={{ borderRadius: 16, overflow: "hidden" }}
    >
      <div className="bg-white border border-amber-300/80">
        <div className="px-3 py-2 flex items-center gap-2 bg-gradient-to-r from-amber-50 to-amber-50/40 border-b border-amber-200/60">
          <div className="w-6 h-6 rounded-lg bg-amber-500 text-white grid place-items-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold text-amber-900 uppercase tracking-[0.06em]">예약 발송</div>
            <div className="text-[11px] text-amber-800 tabular">
              {at.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
              {" · "}
              <span className="font-bold">{countdown} 후 전송</span>
            </div>
          </div>
        </div>
        <div className="px-3.5 py-2.5 text-[13.5px] leading-[1.5] text-ink-900 whitespace-pre-wrap break-words">
          <Attachment msg={msg} mine={false} />
          <Linkify text={msg.content} linkClassName="underline underline-offset-2 text-brand-600 break-all" />
        </div>
        <div className="px-3 py-1.5 border-t border-amber-200/60 bg-amber-50/40 flex items-center justify-end gap-1">
          <button onClick={onEdit} className="text-[11px] font-bold text-ink-700 hover:text-ink-900 px-2 py-0.5 rounded hover:bg-white/80">
            수정
          </button>
          <button onClick={onCancel} className="text-[11px] font-bold text-danger hover:brightness-90 px-2 py-0.5 rounded hover:bg-white/80">
            예약 취소
          </button>
        </div>
      </div>
    </div>
  );
}

function useCountdown(target: Date) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000 * 20);
    return () => clearInterval(t);
  }, []);
  const diff = target.getTime() - Date.now();
  void tick; // force re-render dependency
  if (diff <= 0) return "곧";
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}일 ${h}시간`;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분`;
  return `${sec}초`;
}

/* -------- Helpers / subcomponents -------- */
function Avatar({ name, color, size = 36, icon }: { name: string; color: string; size?: number; icon?: string }) {
  return (
    <div className="grid place-items-center text-white font-bold flex-shrink-0"
      style={{
        width: size, height: size,
        background: color,
        borderRadius: Math.round(size * 0.32),
        fontSize: Math.round(size * 0.38),
        letterSpacing: "-0.02em",
      }}>
      {icon ?? (name?.[0] ?? "?")}
    </div>
  );
}

function RoomTypeChip({ type }: { type: Room["type"] }) {
  if (type === "DIRECT") return <span className="chip-brand">DM</span>;
  if (type === "TEAM") return <span className="chip-blue">TEAM</span>;
  return <span className="chip-gray">GROUP</span>;
}

/** 멘션 하이라이트 + 링크 자동화된 본문 */
function MessageBody({
  content, mentions, mine, meId,
}: {
  content: string;
  mentions: string[];
  mine: boolean;
  meId?: string;
}) {
  if (!content) return null;
  // @Name 패턴을 잘라서 스타일 적용. 본문의 username 은 알림 대상이 아니어도 표시.
  // 서버 mentions(userId) 에 meId 있으면 "나 태그됨" 강조.
  const iAmTagged = !!meId && mentions.includes(meId);
  const parts: React.ReactNode[] = [];
  const re = /@[\p{L}\p{N}_.-]+/gu;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const start = m.index;
    if (start > last) parts.push(renderPlain(content.slice(last, start), mine, `p-${last}`));
    parts.push(
      <span
        key={`m-${start}`}
        className={`inline-flex items-baseline px-1 rounded font-bold ${
          mine ? "bg-white/20 text-white" : iAmTagged ? "bg-amber-100 text-amber-800" : "bg-brand-50 text-brand-700"
        }`}
      >
        {m[0]}
      </span>
    );
    last = start + m[0].length;
  }
  if (last < content.length) parts.push(renderPlain(content.slice(last), mine, `p-end`));
  return <>{parts}</>;
}

function renderPlain(text: string, mine: boolean, key: string) {
  return (
    <Linkify
      key={key}
      text={text}
      linkClassName={`underline underline-offset-2 hover:opacity-80 break-all ${mine ? "text-white" : "text-brand-600"}`}
    />
  );
}

function ReactionRow({
  reactions, meId, onToggle, mine,
}: {
  reactions: Reaction[];
  meId?: string;
  onToggle: (emoji: string) => void;
  mine: boolean;
}) {
  // aggregate by emoji, preserve order of first occurrence
  const order: string[] = [];
  const groups = new Map<string, { count: number; mine: boolean; users: { name: string; isMe: boolean }[] }>();
  for (const r of reactions) {
    if (!groups.has(r.emoji)) { order.push(r.emoji); groups.set(r.emoji, { count: 0, mine: false, users: [] }); }
    const g = groups.get(r.emoji)!;
    g.count += 1;
    if (r.userId === meId) g.mine = true;
    g.users.push({ name: r.user?.name ?? "누군가", isMe: r.userId === meId });
  }

  return (
    <div className="flex flex-wrap gap-1">
      {order.map((emoji) => {
        const g = groups.get(emoji)!;
        return <ReactionChip key={emoji} emoji={emoji} group={g} onToggle={() => onToggle(emoji)} />;
      })}
    </div>
  );
}

function ReactionChip({
  emoji,
  group,
  onToggle,
}: {
  emoji: string;
  group: { count: number; mine: boolean; users: { name: string; isMe: boolean }[] };
  onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);
  const timerRef = useRef<number | null>(null);
  function enter() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setHover(true), 280);
  }
  function leave() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setHover(false);
  }

  const meIdx = group.users.findIndex((u) => u.isMe);
  const labelName = (u: { name: string; isMe: boolean }) => (u.isMe ? `${u.name} (나)` : u.name);
  const listLine = group.users.map(labelName).join(", ");
  const action = group.mine ? "반응 취소" : "반응 추가";

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        onClick={onToggle}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[11px] transition ${
          group.mine
            ? "bg-brand-50 border-brand-300 text-brand-700"
            : "bg-white border-ink-200 text-ink-700 hover:border-ink-300"
        }`}
      >
        <span className="text-[13px] leading-none">{emoji}</span>
        <span className="tabular font-semibold">{group.count}</span>
      </button>

      {hover && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 pointer-events-none">
          <div className="bg-ink-900 text-white rounded-lg shadow-pop px-2.5 py-1.5 min-w-[140px] max-w-[240px]">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[16px]">{emoji}</span>
              <span className="text-[11px] text-ink-300">{group.count}명 반응</span>
            </div>
            <div className="text-[11px] text-white leading-[1.45] break-keep">
              {listLine}
            </div>
            <div className="text-[10px] text-ink-400 mt-1">클릭하여 {action}</div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-x-[6px] border-x-transparent border-t-[6px] border-t-ink-900" />
          </div>
          {/* meIdx 는 향후 강조용 자리 유지 */}
          <span className="hidden">{meIdx}</span>
        </div>
      )}
    </div>
  );
}

function SmileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M8 14c1.5 1.5 3 2 4 2s2.5-.5 4-2" /><path d="M9 9h.01M15 9h.01" />
    </svg>
  );
}

function Attachment({ msg, mine }: { msg: Message; mine: boolean }) {
  // 서버 검증과 별개로 렌더 단에서도 /uploads/ 경로만 허용 — javascript:/data: XSS 차단
  const fileUrl = msg.fileUrl && /^\/uploads\/[A-Za-z0-9._-]+$/.test(msg.fileUrl) ? msg.fileUrl : null;
  if (!fileUrl) return null;
  if (msg.kind === "IMAGE") {
    return (
      <a href={fileUrl} target="_blank" rel="noreferrer" className={`block ${msg.content ? "mb-2" : ""}`}>
        <img src={fileUrl} alt={msg.fileName ?? ""} className="max-h-72 max-w-full rounded-xl" />
      </a>
    );
  }
  if (msg.kind === "VIDEO") {
    return <video src={fileUrl} controls className={`max-h-72 max-w-full rounded-xl block ${msg.content ? "mb-2" : ""}`} />;
  }
  return (
    <a href={fileUrl} target="_blank" rel="noreferrer" download={msg.fileName ?? undefined}
      className={`flex items-center gap-2.5 p-2.5 rounded-xl ${msg.content ? "mb-2" : ""} ${mine ? "bg-white/15" : "bg-ink-50 border border-ink-150"}`}>
      <div className={`w-9 h-9 rounded-lg grid place-items-center ${mine ? "bg-white/20" : "bg-white border border-ink-150"}`}>
        <FileIcon color={mine ? "#fff" : "#4A5058"} />
      </div>
      <div className="min-w-0 text-left">
        <div className={`text-[12.5px] font-bold truncate ${mine ? "text-white" : "text-ink-900"}`}>{msg.fileName}</div>
        <div className={`text-[10.5px] tabular ${mine ? "text-white/80" : "text-ink-500"}`}>{humanSize(msg.fileSize ?? 0)}</div>
      </div>
    </a>
  );
}

function AttachmentPreview({ a }: { a: { url: string; name: string; type: string; size: number; kind: string } }) {
  if (a.kind === "IMAGE") return <img src={a.url} alt={a.name} className="w-10 h-10 object-cover rounded-lg" />;
  if (a.kind === "VIDEO") return (
    <div className="w-10 h-10 rounded-lg bg-ink-200 grid place-items-center">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#4A5058"><path d="M8 5v14l11-7z" /></svg>
    </div>
  );
  return (
    <div className="w-10 h-10 rounded-lg bg-ink-100 grid place-items-center">
      <FileIcon />
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 bg-ink-900/40 grid place-items-center p-4 z-50" onClick={onClose}>
      <div className="panel w-full max-w-md shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <div className="title">{title}</div>
          <button className="btn-icon" onClick={onClose}><CloseIcon /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function groupScheduledByDay(list: ScheduledRow[]): [string, ScheduledRow[]][] {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const map = new Map<string, ScheduledRow[]>();
  for (const s of list) {
    const d = new Date(s.scheduledAt);
    let label: string;
    if (d.toDateString() === today.toDateString()) label = "오늘";
    else if (d.toDateString() === tomorrow.toDateString()) label = "내일";
    else label = d.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(s);
  }
  return Array.from(map.entries());
}

function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatRelative(d: Date) {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분`;
  const hour = Math.floor(min / 60);
  if (hour < 24 && d.toDateString() === new Date().toDateString())
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}일`;
  return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
}

/* Icons */
function PlusIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>; }
function DmIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v11H9l-4 4z" /></svg>; }
function ScheduleIcon({ small }: { small?: boolean } = {}) {
  const s = small ? 11 : 14;
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}
function PaperclipIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8l-8.58 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>; }
function EditIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>; }
function TrashIcon() { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>; }
function CloseIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>; }
function FileIcon({ color = "#4A5058" }: { color?: string } = {}) { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>; }
function Spinner() { return <svg width="14" height="14" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9" strokeDasharray="45 45" strokeLinecap="round" /></svg>; }
