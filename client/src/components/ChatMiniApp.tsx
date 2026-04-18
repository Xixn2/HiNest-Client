import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { useNotifications } from "../notifications";
import {
  C,
  FONT,
  Avatar,
  formatBytes,
  formatRelative,
  loadAllRoomSettings,
  previewForMessage,
  roomColor,
  roomTitle,
  saveAllRoomSettings,
} from "./chat/theme";
import type {
  Attachment,
  Message,
  MessageHit,
  Room,
  RoomLocalSetting,
} from "./chat/types";
import {
  AttachmentPreview,
  LongPress,
  MessageBubble,
  ReactionPicker,
  groupReactions,
} from "./chat/MessageBubble";

/**
 * 팝업 내부 사내톡 — 토스(Toss) 스타일 코디네이터.
 *  - 방 목록 / 대화방 / 방 설정 / 그룹 생성 뷰를 상태 기반으로 전환
 *  - 테마/타입/말풍선은 ./chat/* 로 분할
 */

export default function ChatMiniApp({
  active: isPanelOpen,
  onActiveRoomChange,
  createGroupRequestId,
}: {
  active: boolean;
  /** 대화방 진입/뒤로가기를 ChatFab 헤더가 알 수 있게 알림 */
  onActiveRoomChange?: (info: {
    title: string;
    subtitle: string;
    color: string;
    onBack: () => void;
    onTitleClick?: () => void;
    isSettings?: boolean;
  } | null) => void;
  /** 이 값이 변할 때마다 그룹 생성 뷰를 엶 */
  createGroupRequestId?: number;
}) {
  const { user } = useAuth();
  const { items: notifItems, markRoomRead } = useNotifications();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [q, setQ] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  // 방별 로컬 설정(별명/음소거) — localStorage 보관
  const [roomSettings, setRoomSettings] = useState<Record<string, RoomLocalSetting>>(() => loadAllRoomSettings());
  const scrollRef = useRef<HTMLDivElement>(null);

  const patchRoomSetting = (roomId: string, patch: { nickname?: string; muted?: boolean }) => {
    setRoomSettings((prev) => {
      const next = { ...prev, [roomId]: { ...prev[roomId], ...patch } };
      // 빈 별명은 삭제로 취급
      if (patch.nickname === "") {
        const cp = { ...next[roomId] };
        delete cp.nickname;
        next[roomId] = cp;
      }
      saveAllRoomSettings(next);
      return next;
    });
  };

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

  const active = useMemo(() => rooms.find((r) => r.id === activeId) ?? null, [rooms, activeId]);

  const loadRooms = async () => {
    try {
      const res = await api<{ rooms: Room[] }>("/api/chat/rooms");
      setRooms(res.rooms);
    } catch {}
  };
  const loadMessages = async (roomId: string) => {
    try {
      const res = await api<{ messages: Message[] }>(`/api/chat/rooms/${roomId}/messages`);
      setMessages(res.messages);
      // 스크롤은 RoomView 의 useLayoutEffect 에서 페인트 전에 수행 (플래시 방지)
    } catch {}
  };

  useEffect(() => { if (isPanelOpen) loadRooms(); }, [isPanelOpen]);
  useEffect(() => {
    if (!isPanelOpen) return;
    const t = setInterval(loadRooms, 5000);
    return () => clearInterval(t);
  }, [isPanelOpen]);
  useEffect(() => {
    if (!activeId) return;
    // 새 방 진입 시 이전 메시지 즉시 제거 → 이전 방의 메시지가 잠깐 보이는 현상 방지
    setMessages([]);
    loadMessages(activeId);
    markRoomRead(activeId);
    const t = setInterval(() => loadMessages(activeId), 3000);
    return () => clearInterval(t);
  }, [activeId]);

  // 상위 ChatFab 헤더가 방 정보를 보여줄 수 있도록 알림
  const activeRoomObj = useMemo(() => rooms.find((r) => r.id === activeId) ?? null, [rooms, activeId]);
  useEffect(() => {
    if (!onActiveRoomChange) return;
    if (activeRoomObj) {
      const override = roomSettings[activeRoomObj.id]?.nickname;
      const title = override || roomTitle(activeRoomObj, user?.id ?? "");
      const muted = !!roomSettings[activeRoomObj.id]?.muted;
      const baseSub =
        activeRoomObj.type === "DIRECT" ? "1:1 대화"
          : activeRoomObj.type === "TEAM" ? "팀"
            : `${activeRoomObj.members.length}명`;
      const subtitle = showSettings ? "채팅방 설정" : (muted ? `${baseSub} · 알림 꺼짐` : baseSub);
      onActiveRoomChange({
        title,
        subtitle,
        color: roomColor(activeRoomObj, user?.id ?? ""),
        onBack: showSettings
          ? () => setShowSettings(false)
          : () => { setActiveId(null); setMessages([]); setShowSettings(false); },
        onTitleClick: showSettings ? undefined : () => setShowSettings(true),
        isSettings: showSettings,
      });
    } else {
      onActiveRoomChange(null);
    }
    return () => { if (!activeId) onActiveRoomChange(null); };
  }, [activeRoomObj, user?.id, showSettings, roomSettings]);

  // 방 전환 시 설정 화면은 항상 닫음
  useEffect(() => { setShowSettings(false); }, [activeId]);

  // 상위에서 그룹 생성 요청이 오면 생성 뷰 열기 (0은 초기값이라 무시)
  useEffect(() => {
    if (!createGroupRequestId) return;
    setCreatingGroup(true);
  }, [createGroupRequestId]);

  // 그룹 생성 뷰가 열려 있는 동안은 헤더를 "새 그룹 만들기"로 교체,
  // 닫히면 목록 상태일 때 헤더를 ListHeader(사내톡)로 되돌림.
  useEffect(() => {
    if (!onActiveRoomChange) return;
    if (creatingGroup) {
      onActiveRoomChange({
        title: "새 그룹 만들기",
        subtitle: "",
        color: C.blue,
        onBack: () => setCreatingGroup(false),
        isSettings: true, // compact 헤더 재사용
      });
    } else if (!activeRoomObj) {
      // 방도 안 열려 있으면 헤더 해제 (ChatFab이 ListHeader를 렌더)
      onActiveRoomChange(null);
    }
  }, [creatingGroup]);

  async function uploadFile(file: File): Promise<Attachment | null> {
    const form = new FormData();
    form.append("file", file);
    setUploading(true);
    try {
      const r = await fetch("/api/upload", { method: "POST", body: form, credentials: "include" });
      if (!r.ok) throw new Error("upload failed");
      const j = await r.json();
      return { url: j.url, name: j.name, type: j.type, size: j.size, kind: j.kind };
    } catch {
      alert("파일 업로드에 실패했어요");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function pickAndUpload(file: File) {
    const att = await uploadFile(file);
    if (att) setAttachment(att);
  }

  async function reactToMessage(messageId: string, emoji: string) {
    // 낙관적 토글: 내 리액션이 이미 있으면 제거, 없으면 추가
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      const list = m.reactions ?? [];
      const mine = list.find((r) => r.userId === (user?.id ?? "") && r.emoji === emoji);
      const next = mine
        ? list.filter((r) => !(r.userId === (user?.id ?? "") && r.emoji === emoji))
        : [...list, { userId: user?.id ?? "", emoji, user: { name: user?.name ?? "나" } }];
      return { ...m, reactions: next };
    }));
    try {
      await api(`/api/chat/messages/${messageId}/reactions`, {
        method: "POST",
        json: { emoji },
      });
      if (activeId) loadMessages(activeId);
    } catch {
      if (activeId) loadMessages(activeId);
    }
  }

  async function send() {
    if (!activeId || sending) return;
    const content = input.trim();
    if (!content && !attachment) return;
    const prevInput = input;
    const prevAttachment = attachment;
    setInput("");
    setAttachment(null);
    setSending(true);
    try {
      if (prevAttachment) {
        await api(`/api/chat/rooms/${activeId}/messages`, {
          method: "POST",
          json: {
            content,
            kind: prevAttachment.kind,
            fileUrl: prevAttachment.url,
            fileName: prevAttachment.name,
            fileType: prevAttachment.type,
            fileSize: prevAttachment.size,
          },
        });
      } else {
        await api(`/api/chat/rooms/${activeId}/messages`, {
          method: "POST",
          json: { content, kind: "TEXT" },
        });
      }
      await loadMessages(activeId);
    } catch {
      setInput(prevInput);
      setAttachment(prevAttachment);
    } finally {
      setSending(false);
    }
  }

  const filteredRooms = useMemo(() => {
    const k = q.trim().toLowerCase();
    const base = k
      ? rooms.filter((r) => roomTitle(r, user?.id ?? "").toLowerCase().includes(k))
      : rooms;
    // 가장 최근 메시지가 있는 방을 위로. 메시지 없으면 맨 뒤.
    return [...base].sort((a, b) => {
      const ta = a.messages[0]?.createdAt ? new Date(a.messages[0].createdAt).getTime() : 0;
      const tb = b.messages[0]?.createdAt ? new Date(b.messages[0].createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [rooms, q, user?.id]);

  // 메시지 본문 검색 — 검색어 입력 시 debounce 후 서버 조회
  const [messageHits, setMessageHits] = useState<MessageHit[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const k = q.trim();
    if (!k) { setMessageHits([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await api<{ hits: MessageHit[] }>(`/api/chat/search?q=${encodeURIComponent(k)}`);
        setMessageHits(res.hits);
      } catch {
        setMessageHits([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div
      style={{
        width: "100%", height: "100%",
        display: "flex", flexDirection: "column",
        background: "#fff",
        fontFamily: FONT,
        color: C.ink,
        letterSpacing: "-0.01em",
      }}
    >
      {creatingGroup ? (
        <CreateGroupView
          meId={user?.id ?? ""}
          onCancel={() => setCreatingGroup(false)}
          onCreated={(roomId) => {
            setCreatingGroup(false);
            loadRooms();
            setActiveId(roomId);
          }}
        />
      ) : active && showSettings ? (
        <SettingsView
          room={active}
          meId={user?.id ?? ""}
          settings={roomSettings[active.id] ?? {}}
          onPatch={(p) => patchRoomSetting(active.id, p)}
        />
      ) : active ? (
        <RoomView
          room={active}
          messages={messages}
          meId={user?.id ?? ""}
          onBack={() => { setActiveId(null); setMessages([]); }}
          input={input}
          setInput={setInput}
          onSend={send}
          sending={sending}
          scrollRef={scrollRef}
          attachment={attachment}
          uploading={uploading}
          onPickFile={pickAndUpload}
          onClearAttachment={() => setAttachment(null)}
          onReact={reactToMessage}
        />
      ) : (
        <ListView
          rooms={filteredRooms}
          meId={user?.id ?? ""}
          unread={roomUnread}
          q={q}
          setQ={setQ}
          onOpen={(id) => setActiveId(id)}
          messageHits={messageHits}
          searching={searching}
          roomSettings={roomSettings}
        />
      )}
    </div>
  );
}

/* ======================= 목록 ======================= */
function ListView({
  rooms, meId, unread, q, setQ, onOpen, messageHits, searching, roomSettings,
}: {
  rooms: Room[]; meId: string; unread: Record<string, number>;
  q: string; setQ: (v: string) => void; onOpen: (id: string) => void;
  messageHits: MessageHit[]; searching: boolean;
  roomSettings: Record<string, RoomLocalSetting>;
}) {
  const displayTitle = (r: Room) => roomSettings[r.id]?.nickname || roomTitle(r, meId);
  const isSearching = q.trim().length > 0;
  // 이름 매치된 방에 이미 있는 roomId는 메시지 히트에서 제외 (중복 방지)
  const nameHitIds = new Set(rooms.map((r) => r.id));
  const uniqueMsgHits = messageHits.filter((h) => !nameHitIds.has(h.roomId));

  return (
    <>
      {/* 검색바 */}
      <div style={{ padding: "4px 18px 10px" }}>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            height: 44, padding: "0 14px",
            background: C.gray100,
            borderRadius: 12,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gray500} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름 · 메시지 검색"
            style={{
              flex: 1, border: 0, outline: 0, background: "transparent",
              fontSize: 14, fontWeight: 500, color: C.ink,
              fontFamily: FONT, letterSpacing: "-0.01em",
            }}
          />
          {isSearching && (
            <button
              onClick={() => setQ("")}
              title="지우기"
              style={{
                width: 18, height: 18, borderRadius: 999,
                background: C.gray500, color: "#fff",
                border: 0, cursor: "pointer",
                display: "grid", placeItems: "center",
                flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 결과 영역 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
        {/* ===== 이름 섹션 ===== */}
        {isSearching && <SectionLabel>이름</SectionLabel>}
        {rooms.length === 0 && !isSearching && (
          <div style={{ padding: "72px 0", textAlign: "center", color: C.gray500, fontSize: 14, fontWeight: 500 }}>
            대화가 없어요
          </div>
        )}
        {isSearching && rooms.length === 0 && (
          <EmptyRow>이름이 일치하는 대화가 없어요</EmptyRow>
        )}
        {rooms.map((r) => {
          const title = displayTitle(r);
          const last = r.messages[0];
          const muted = !!roomSettings[r.id]?.muted;
          const u = muted ? 0 : (unread[r.id] ?? 0);
          const mine = !!last && last.senderId === meId;
          const preview = last ? previewForMessage(last) : "새로운 대화를 시작해보세요";
          const prefix = last && mine ? "나: " : undefined;
          return (
            <ListRow
              key={r.id}
              onClick={() => onOpen(r.id)}
              avatar={{ name: title, color: roomColor(r, meId) }}
              title={title}
              titleHighlight={q}
              subtitle={preview}
              subtitlePrefix={prefix}
              rightTop={last ? formatRelative(new Date(last.createdAt)) : null}
              unread={u}
              muted={muted}
            />
          );
        })}

        {/* ===== 채팅 내역 섹션 ===== */}
        {isSearching && (
          <>
            <SectionLabel>채팅 내역{searching ? " · 검색중" : ""}</SectionLabel>
            {uniqueMsgHits.length === 0 && !searching && (
              <EmptyRow>메시지 내용이 일치하는 대화가 없어요</EmptyRow>
            )}
            {uniqueMsgHits.map((h) => {
              const title = roomSettings[h.roomId]?.nickname || roomTitle(h.room, meId);
              return (
                <ListRow
                  key={h.message.id}
                  onClick={() => onOpen(h.roomId)}
                  avatar={{ name: title, color: roomColor(h.room, meId) }}
                  title={title}
                  subtitle={h.message.content}
                  subtitleHighlight={q}
                  subtitlePrefix={(h.message.sender.id === meId ? "나" : h.message.sender.name) + ": "}
                  rightTop={formatRelative(new Date(h.message.createdAt))}
                  unread={0}
                />
              );
            })}
          </>
        )}
      </div>
    </>
  );
}

/* ===== 리스트 섹션 헤더 (토스 스타일) ===== */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "14px 12px 6px",
        fontSize: 12,
        fontWeight: 700,
        color: C.gray500,
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </div>
  );
}
function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "18px 12px", color: C.gray500, fontSize: 13, fontWeight: 500 }}>
      {children}
    </div>
  );
}

/* ===== 범용 리스트 행 ===== */
function ListRow({
  onClick, avatar, title, titleHighlight, subtitle, subtitleHighlight, subtitlePrefix, rightTop, unread, muted,
}: {
  onClick: () => void;
  avatar: { name: string; color: string };
  title: string;
  titleHighlight?: string;
  subtitle: string;
  subtitleHighlight?: string;
  subtitlePrefix?: string;
  rightTop: string | null;
  unread: number;
  muted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 12px",
        borderRadius: 12,
        background: "transparent",
        border: 0, textAlign: "left", cursor: "pointer",
        fontFamily: FONT,
        transition: "background .12s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.gray100)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Avatar name={avatar.name} color={avatar.color} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              flex: 1, minWidth: 0,
              display: "flex", alignItems: "center", gap: 4,
              fontSize: 15, fontWeight: 700, color: C.ink,
              letterSpacing: "-0.015em",
            }}
          >
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {highlight(title, titleHighlight)}
            </span>
            {muted && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.gray500} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="알림 꺼짐" style={{ flexShrink: 0 }}>
                <path d="M15 9v3M3 21l18-18" />
                <path d="M18 8a6 6 0 0 0-9.33-4.96" />
                <path d="M6 8v3a6 6 0 0 0 9.6 4.8" />
                <path d="M4 17h14" />
                <path d="M9 21h6" />
              </svg>
            )}
          </div>
          {rightTop && (
            <div style={{ fontSize: 12, fontWeight: 500, color: C.gray500, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {rightTop}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
          <div
            style={{
              flex: 1, minWidth: 0,
              fontSize: 13,
              fontWeight: unread > 0 ? 600 : 500,
              color: unread > 0 ? C.gray700 : C.gray500,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              letterSpacing: "-0.01em",
            }}
          >
            {subtitlePrefix && <span style={{ color: C.gray500 }}>{subtitlePrefix}</span>}
            {highlight(subtitle, subtitleHighlight)}
          </div>
          {unread > 0 && (
            <span
              style={{
                minWidth: 20, height: 20, padding: "0 6px",
                borderRadius: 999,
                background: C.blue, color: "#fff",
                fontSize: 11, fontWeight: 700,
                display: "grid", placeItems: "center",
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/* ===== 키워드 하이라이트 ===== */
function highlight(text: string, q?: string) {
  if (!q || !q.trim()) return text;
  const needle = q.trim();
  const lower = text.toLowerCase();
  const n = needle.toLowerCase();
  const i = lower.indexOf(n);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <span style={{ color: C.blue, fontWeight: 700 }}>{text.slice(i, i + needle.length)}</span>
      {text.slice(i + needle.length)}
    </>
  );
}

/* ======================= 새 그룹 만들기 ======================= */
type DirUser = { id: string; name: string; email?: string; team?: string | null; position?: string | null; avatarColor?: string };

function CreateGroupView({
  meId, onCancel, onCreated,
}: {
  meId: string;
  onCancel: () => void;
  onCreated: (roomId: string) => void;
}) {
  const [allUsers, setAllUsers] = useState<DirUser[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ users: DirUser[] }>("/api/users");
        setAllUsers(res.users.filter((u) => u.id !== meId));
      } catch {}
    })();
  }, [meId]);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return allUsers;
    return allUsers.filter((u) =>
      u.name.toLowerCase().includes(k) ||
      (u.team ?? "").toLowerCase().includes(k) ||
      (u.position ?? "").toLowerCase().includes(k)
    );
  }, [allUsers, q]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedList = useMemo(() => allUsers.filter((u) => selected.has(u.id)), [allUsers, selected]);

  async function submit() {
    setErr(null);
    if (selected.size < 1) { setErr("멤버를 1명 이상 선택해주세요"); return; }
    setBusy(true);
    try {
      const res = await api<{ room: Room }>("/api/chat/rooms", {
        method: "POST",
        json: {
          type: "GROUP",
          name: name.trim() || undefined,
          memberIds: Array.from(selected),
        },
      });
      onCreated(res.room.id);
    } catch (e: any) {
      setErr(e?.message ?? "생성에 실패했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#fff" }}>
      {/* 스크롤 영역 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 18px 12px" }}>
        {/* 그룹 이름 */}
        <SectionLabel>그룹 이름 (선택)</SectionLabel>
        <div
          style={{
            background: C.gray100, borderRadius: 12,
            padding: "10px 14px",
            display: "flex", alignItems: "center",
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 마케팅 팀"
            maxLength={40}
            style={{
              flex: 1, border: 0, outline: 0, background: "transparent",
              fontSize: 14, fontWeight: 600, color: C.ink,
              fontFamily: FONT, letterSpacing: "-0.01em",
            }}
          />
        </div>

        {/* 선택된 멤버 칩 */}
        {selectedList.length > 0 && (
          <>
            <SectionLabel>선택한 멤버 {selectedList.length}명</SectionLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedList.map((u) => (
                <button
                  key={u.id}
                  onClick={() => toggle(u.id)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "6px 8px 6px 4px",
                    background: C.blue, color: "#fff",
                    borderRadius: 999, border: 0, cursor: "pointer",
                    fontSize: 12.5, fontWeight: 600, fontFamily: FONT,
                    letterSpacing: "-0.01em",
                  }}
                  title="선택 해제"
                >
                  <Avatar name={u.name} color={u.avatarColor ?? "rgba(255,255,255,.3)"} size={22} />
                  {u.name}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}

        {/* 검색 */}
        <SectionLabel>멤버 추가</SectionLabel>
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            height: 44, padding: "0 14px",
            background: C.gray100, borderRadius: 12,
            marginBottom: 8,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.gray500} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름 · 팀 · 직책으로 검색"
            style={{
              flex: 1, border: 0, outline: 0, background: "transparent",
              fontSize: 14, fontWeight: 500, color: C.ink,
              fontFamily: FONT, letterSpacing: "-0.01em",
            }}
          />
        </div>

        {/* 유저 리스트 */}
        {filtered.length === 0 && (
          <EmptyRow>일치하는 사용자가 없어요</EmptyRow>
        )}
        {filtered.map((u) => {
          const on = selected.has(u.id);
          const subtitle = [u.team, u.position].filter(Boolean).join(" · ") || (u.email ?? "");
          return (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              style={{
                width: "100%",
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 8px",
                background: "transparent", border: 0,
                borderRadius: 12, cursor: "pointer",
                fontFamily: FONT, textAlign: "left",
                transition: "background .12s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = C.gray100)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <Avatar name={u.name} color={u.avatarColor ?? C.blue} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {u.name}
                </div>
                {subtitle && (
                  <div style={{ marginTop: 1, fontSize: 12, fontWeight: 500, color: C.gray500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {subtitle}
                  </div>
                )}
              </div>
              {/* 체크박스 */}
              <div
                style={{
                  width: 22, height: 22, borderRadius: 999,
                  background: on ? C.blue : "transparent",
                  border: on ? "0" : `2px solid ${C.gray300}`,
                  display: "grid", placeItems: "center",
                  flexShrink: 0,
                  transition: "background .12s ease",
                }}
              >
                {on && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 하단 액션 바 */}
      <div style={{ padding: "12px 18px 16px", background: "#fff", display: "flex", gap: 8 }}>
        {err && (
          <div style={{ alignSelf: "center", fontSize: 12.5, fontWeight: 600, color: C.red }}>{err}</div>
        )}
        <button
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: "0 16px", height: 48, borderRadius: 12,
            background: C.gray100, color: C.ink,
            border: 0, cursor: "pointer",
            fontSize: 14, fontWeight: 700, fontFamily: FONT,
          }}
        >
          취소
        </button>
        <button
          onClick={submit}
          disabled={busy || selected.size < 1}
          style={{
            flex: 1, height: 48, borderRadius: 12,
            background: busy || selected.size < 1 ? C.gray300 : C.blue,
            color: "#fff",
            border: 0, cursor: busy || selected.size < 1 ? "not-allowed" : "pointer",
            fontSize: 15, fontWeight: 700, fontFamily: FONT,
            letterSpacing: "-0.01em",
          }}
        >
          {busy ? "만드는 중..." : selected.size > 0 ? `${selected.size}명과 그룹 만들기` : "멤버 선택"}
        </button>
      </div>
    </div>
  );
}

/* ======================= 채팅방 설정 ======================= */
function SettingsView({
  room, meId, settings, onPatch,
}: {
  room: Room;
  meId: string;
  settings: { nickname?: string; muted?: boolean };
  onPatch: (p: { nickname?: string; muted?: boolean }) => void;
}) {
  const originalTitle = roomTitle(room, meId);
  const [draft, setDraft] = useState(settings.nickname ?? "");
  const [editing, setEditing] = useState(false);
  const muted = !!settings.muted;

  const commit = () => {
    const next = draft.trim();
    // 원본 이름과 같으면 저장하지 않음 (별명 해제)
    onPatch({ nickname: next === originalTitle ? "" : next });
    setEditing(false);
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "6px 18px 18px", background: "#fff" }}>
      {/* 프로필 블록 — 중앙 정렬 */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0 20px" }}>
        <Avatar name={settings.nickname || originalTitle} color={roomColor(room, meId)} size={72} />
        <div
          style={{
            marginTop: 12,
            fontSize: 18, fontWeight: 700, color: C.ink,
            letterSpacing: "-0.02em",
          }}
        >
          {settings.nickname || originalTitle}
        </div>
        {settings.nickname && (
          <div style={{ marginTop: 2, fontSize: 12, fontWeight: 500, color: C.gray500 }}>
            원래 이름: {originalTitle}
          </div>
        )}
      </div>

      {/* 이름 변경 */}
      <SectionLabel>이름 변경</SectionLabel>
      <div
        style={{
          background: C.gray100,
          borderRadius: 12,
          padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 8,
        }}
      >
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) commit();
                if (e.key === "Escape") { setDraft(settings.nickname ?? ""); setEditing(false); }
              }}
              placeholder={originalTitle}
              style={{
                flex: 1, border: 0, outline: 0, background: "transparent",
                fontSize: 14, fontWeight: 600, color: C.ink,
                fontFamily: FONT, letterSpacing: "-0.01em",
              }}
            />
            <button
              onClick={commit}
              style={{
                padding: "6px 12px", borderRadius: 8,
                background: C.blue, color: "#fff",
                border: 0, cursor: "pointer",
                fontSize: 13, fontWeight: 700, fontFamily: FONT,
              }}
            >
              저장
            </button>
          </>
        ) : (
          <>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.ink }}>
              {settings.nickname || originalTitle}
            </div>
            <button
              onClick={() => { setDraft(settings.nickname ?? ""); setEditing(true); }}
              style={{
                padding: "6px 12px", borderRadius: 8,
                background: "#fff", color: C.ink,
                border: `1px solid ${C.gray300}`, cursor: "pointer",
                fontSize: 13, fontWeight: 600, fontFamily: FONT,
              }}
            >
              변경
            </button>
          </>
        )}
      </div>
      {settings.nickname && !editing && (
        <button
          onClick={() => onPatch({ nickname: "" })}
          style={{
            marginTop: 8, padding: "8px 12px",
            background: "transparent", color: C.gray600,
            border: 0, cursor: "pointer",
            fontSize: 12, fontWeight: 600, fontFamily: FONT,
          }}
        >
          원래 이름으로 되돌리기
        </button>
      )}

      {/* 알림 끄기 */}
      <SectionLabel>알림</SectionLabel>
      <button
        onClick={() => onPatch({ muted: !muted })}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 14px",
          background: C.gray100, borderRadius: 12,
          border: 0, cursor: "pointer",
          fontFamily: FONT, textAlign: "left",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, letterSpacing: "-0.01em" }}>
            알림 끄기
          </div>
          <div style={{ marginTop: 2, fontSize: 12, fontWeight: 500, color: C.gray600 }}>
            {muted ? "이 대화는 알림을 받지 않아요" : "메시지 알림을 받아요"}
          </div>
        </div>
        {/* 스위치 */}
        <div
          style={{
            width: 46, height: 28, borderRadius: 999,
            background: muted ? C.blue : C.gray300,
            position: "relative",
            transition: "background .18s ease",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 2, left: muted ? 20 : 2,
              width: 24, height: 24, borderRadius: "50%",
              background: "#fff",
              boxShadow: "0 1px 3px rgba(0,0,0,.15)",
              transition: "left .18s ease",
            }}
          />
        </div>
      </button>
    </div>
  );
}

/* ======================= 대화방 ======================= */
function RoomView({
  room, messages, meId, onBack, input, setInput, onSend, sending, scrollRef,
  attachment, uploading, onPickFile, onClearAttachment, onReact,
}: {
  room: Room; messages: Message[]; meId: string; onBack: () => void;
  input: string; setInput: (v: string) => void; onSend: () => void; sending: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  attachment: Attachment | null; uploading: boolean;
  onPickFile: (file: File) => void; onClearAttachment: () => void;
  onReact: (messageId: string, emoji: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const prevCountRef = useRef(0);
  const stuckToBottomRef = useRef(true);

  // 방이 바뀌면 다시 준비 상태로 돌려서 첫 페인트 전에 최하단으로 점프
  useEffect(() => {
    setReady(false);
    prevCountRef.current = 0;
    stuckToBottomRef.current = true;
  }, [room.id]);

  // 페인트 직전에 스크롤 조정 — 플래시 방지
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const count = messages.length;
    const grew = count > prevCountRef.current;

    if (!ready && count > 0) {
      // 첫 로드: 즉시 최하단으로 (부드러운 스크롤 X, 화면에 안 보이는 상태에서 점프)
      el.scrollTop = el.scrollHeight;
      setReady(true);
    } else if (grew && stuckToBottomRef.current) {
      // 새 메시지가 왔고 사용자가 하단에 있었으면 따라 내려감
      el.scrollTop = el.scrollHeight;
    }
    prevCountRef.current = count;
  }, [messages, ready]);

  // 사용자가 위로 스크롤했는지 추적 — 추적값에 따라 자동 하단 붙기 토글
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    stuckToBottomRef.current = distanceFromBottom < 40;
  };
  const rendered = useMemo(() => messages.map((m, i) => {
    const prev = messages[i - 1];
    const showMeta = !prev || prev.sender.id !== m.sender.id
      || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 5 * 60_000;
    return { ...m, showMeta };
  }), [messages]);
  // 헤더는 상위 ChatFab이 렌더링 — 여기서는 메시지 + 입력만
  void room; void onBack; // 시그니처 유지

  return (
    <>
      {/* 메시지 영역 */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          flex: 1, overflowY: "auto",
          padding: "4px 14px 10px",
          background: "#fff",
          // 첫 로드 완료 전에는 감춰서 "위에서 아래로 스크롤되는" 플래시를 숨김
          visibility: ready || messages.length === 0 ? "visible" : "hidden",
        }}
      >
        {messages.length === 0 && (
          <div style={{ padding: "72px 0", textAlign: "center", color: C.gray500, fontSize: 14, fontWeight: 500 }}>
            첫 메시지를 보내보세요
          </div>
        )}
        {rendered.map((m) => {
          const mine = m.sender.id === meId;
          const isPicking = reactingId === m.id;
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, maxWidth: "78%", flexDirection: mine ? "row-reverse" : "row" }}>
                {!mine && m.showMeta ? (
                  <Avatar name={m.sender.name} color={m.sender.avatarColor ?? C.blue} size={26} />
                ) : !mine ? (
                  <div style={{ width: 26 }} />
                ) : null}
                <div style={{ minWidth: 0, position: "relative" }}>
                  {!mine && m.showMeta && (
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: C.gray600, marginLeft: 12, marginBottom: 3 }}>
                      {m.sender.name}
                    </div>
                  )}
                  {m.deletedAt ? (
                    <div
                      style={{
                        padding: "9px 13px", fontSize: 14, fontWeight: 500,
                        lineHeight: 1.4, letterSpacing: "-0.01em",
                        color: mine ? "#fff" : C.ink,
                        background: mine ? C.blue : C.gray100,
                        borderRadius: 16, fontStyle: "italic", opacity: 0.6,
                      }}
                    >
                      삭제된 메시지
                    </div>
                  ) : (
                    <LongPress
                      onLongPress={() => setReactingId(m.id)}
                      style={{
                        transition: "transform .12s ease",
                        transform: isPicking ? "scale(.97)" : "scale(1)",
                      }}
                    >
                      <MessageBubble msg={m} mine={mine} />
                    </LongPress>
                  )}

                  {/* 리액션 칩 */}
                  {m.reactions && m.reactions.length > 0 && (
                    <div
                      style={{
                        display: "flex", flexWrap: "wrap", gap: 4,
                        marginTop: 4,
                        justifyContent: mine ? "flex-end" : "flex-start",
                      }}
                    >
                      {groupReactions(m.reactions).map((g) => {
                        const isMine = g.userIds.includes(meId);
                        return (
                          <button
                            key={g.emoji}
                            type="button"
                            onClick={() => onReact(m.id, g.emoji)}
                            title={g.names.join(", ")}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "2px 8px", height: 24,
                              borderRadius: 999,
                              background: isMine ? C.blueSoft : C.gray100,
                              border: isMine ? `1px solid ${C.blue}` : `1px solid ${C.gray200}`,
                              color: C.ink, cursor: "pointer",
                              fontSize: 12, fontWeight: 600,
                              fontFamily: FONT,
                            }}
                          >
                            <span style={{ fontSize: 13 }}>{g.emoji}</span>
                            <span style={{ fontVariantNumeric: "tabular-nums" }}>{g.count}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 이모지 픽커 */}
                  {isPicking && (
                    <ReactionPicker
                      mine={mine}
                      onPick={(e) => { onReact(m.id, e); setReactingId(null); }}
                      onDismiss={() => setReactingId(null)}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 숨김 파일 인풋 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,*/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPickFile(f);
          e.target.value = "";
        }}
      />

      {/* 첨부 미리보기 — 파일 선택 시 입력바 위에 표시 */}
      {attachment && (
        <div
          style={{
            padding: "0 14px 8px",
            background: "#fff",
          }}
        >
          <AttachmentPreview att={attachment} onClear={onClearAttachment} />
        </div>
      )}
      {uploading && !attachment && (
        <div style={{ padding: "0 14px 8px", fontSize: 12, color: C.gray600, fontWeight: 500 }}>
          업로드 중…
        </div>
      )}

      {/* 입력바 — 필(내부 클립) + 외부 전송 버튼(입력/첨부 시 슬라이드 인) */}
      {(() => {
        const hasContent = !!input.trim() || !!attachment;
        return (
          <div
            style={{
              padding: "10px 14px 14px",
              background: "#fff",
              display: "flex", alignItems: "flex-end", gap: 8,
            }}
          >
            <div
              style={{
                flex: 1, minWidth: 0,
                background: C.gray100,
                borderRadius: 20,
                padding: "8px 8px 8px 14px",
                display: "flex", alignItems: "center", gap: 6,
                transition: "padding .22s cubic-bezier(.22,.61,.36,1)",
              }}
            >
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 92) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder="메시지를 입력하세요"
                style={{
                  flex: 1, border: 0, outline: 0, resize: "none",
                  background: "transparent",
                  fontSize: 14, fontWeight: 500, color: C.ink,
                  fontFamily: FONT, letterSpacing: "-0.01em",
                  lineHeight: 1.4,
                  maxHeight: 92, minHeight: 20,
                }}
              />
              {/* 파일 첨부(클립) — 입력/첨부 없을 때만 표시 */}
              <button
                type="button"
                title="사진, 영상, 파일 첨부"
                aria-label="파일 첨부"
                onClick={() => fileInputRef.current?.click()}
                tabIndex={hasContent ? -1 : 0}
                style={{
                  width: hasContent ? 0 : 28,
                  height: 28,
                  padding: 0,
                  borderRadius: 999,
                  background: "transparent",
                  color: C.gray500,
                  border: 0,
                  cursor: "pointer",
                  display: "grid", placeItems: "center",
                  flexShrink: 0,
                  overflow: "hidden",
                  opacity: hasContent ? 0 : 1,
                  transform: hasContent ? "scale(.7) rotate(-20deg)" : "scale(1) rotate(0)",
                  transition:
                    "opacity .18s ease, transform .22s cubic-bezier(.22,.61,.36,1), width .22s cubic-bezier(.22,.61,.36,1)",
                  pointerEvents: hasContent ? "none" : "auto",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.ink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.gray500)}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05 12.25 20.24a6 6 0 1 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66L9.41 17.41a2 2 0 1 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
            </div>

            {/* 외부 전송 버튼 — 입력/첨부 시 슬라이드 인 */}
            <button
              onClick={onSend}
              disabled={!hasContent || sending}
              title="보내기"
              aria-label="보내기"
              tabIndex={hasContent ? 0 : -1}
              style={{
                width: hasContent ? 40 : 0,
                height: 40,
                padding: 0,
                borderRadius: 999,
                background: sending ? C.gray200 : C.blue,
                color: sending ? C.gray500 : "#fff",
                border: 0,
                cursor: !hasContent || sending ? "default" : "pointer",
                display: "grid", placeItems: "center",
                flexShrink: 0,
                overflow: "hidden",
                marginLeft: hasContent ? 0 : -8, // gap 상쇄 — 숨김 상태에서 갭까지 제거
                opacity: hasContent ? 1 : 0,
                transform: hasContent ? "scale(1) translateX(0)" : "scale(.6) translateX(8px)",
                pointerEvents: hasContent ? "auto" : "none",
                transition:
                  "opacity .2s ease, transform .26s cubic-bezier(.22,.61,.36,1), width .26s cubic-bezier(.22,.61,.36,1), margin-left .26s cubic-bezier(.22,.61,.36,1), background .15s ease",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>
        );
      })()}
    </>
  );
}

