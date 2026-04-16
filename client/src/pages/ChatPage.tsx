import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";

type Room = {
  id: string;
  name: string;
  type: string;
  members: { user: { id: string; name: string; avatarColor: string } }[];
  messages: { content: string; createdAt: string }[];
};

type Message = {
  id: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string; avatarColor: string };
};

type DirectoryUser = {
  id: string;
  name: string;
  email: string;
  team?: string;
  avatarColor?: string;
};

export default function ChatPage() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [active, setActive] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [newRoom, setNewRoom] = useState({ name: "", memberIds: [] as string[] });
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadRooms() {
    const res = await api<{ rooms: Room[] }>("/api/chat/rooms");
    setRooms(res.rooms);
    if (!active && res.rooms.length) setActive(res.rooms[0]);
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

  useEffect(() => {
    loadRooms();
    loadDirectory();
  }, []);

  useEffect(() => {
    if (active) loadMessages(active.id);
  }, [active?.id]);

  // polling
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => loadMessages(active.id), 3000);
    return () => clearInterval(t);
  }, [active?.id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || !active) return;
    await api(`/api/chat/rooms/${active.id}/messages`, { method: "POST", json: { content: input } });
    setInput("");
    loadMessages(active.id);
  }

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    if (newRoom.memberIds.length === 0) return alert("멤버를 선택해주세요");
    const res = await api<{ room: Room }>("/api/chat/rooms", { method: "POST", json: newRoom });
    setCreating(false);
    setNewRoom({ name: "", memberIds: [] });
    await loadRooms();
    setActive(res.room);
  }

  return (
    <div>
      <PageHeader
        title="사내톡"
        description="팀원들과 실시간으로 소통하세요."
        right={<button className="btn-primary" onClick={() => setCreating(true)}>+ 새 채팅방</button>}
      />

      <div className="card p-0 overflow-hidden" style={{ height: "calc(100vh - 220px)" }}>
        <div className="flex h-full">
          <div className="w-72 border-r border-slate-100 overflow-auto">
            {rooms.map((r) => (
              <button
                key={r.id}
                onClick={() => setActive(r)}
                className={`w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-slate-50 ${active?.id === r.id ? "bg-brand-50" : ""}`}
              >
                <div className="font-semibold text-slate-900 truncate">{r.name}</div>
                <div className="text-xs text-slate-500 mt-0.5 truncate">
                  {r.messages[0]?.content ?? `${r.members.length}명 참여`}
                </div>
              </button>
            ))}
            {rooms.length === 0 && <div className="px-4 py-10 text-center text-sm text-slate-400">채팅방이 없습니다.</div>}
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            {active ? (
              <>
                <div className="px-5 py-4 border-b border-slate-100">
                  <div className="font-bold">{active.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {active.members.map((m) => m.user.name).join(", ")}
                  </div>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-auto p-5 space-y-3 bg-slate-50/50">
                  {messages.map((m) => {
                    const mine = m.sender.id === user?.id;
                    return (
                      <div key={m.id} className={`flex gap-2 ${mine ? "justify-end" : ""}`}>
                        {!mine && (
                          <div
                            className="w-8 h-8 rounded-full grid place-items-center text-white text-sm font-bold flex-shrink-0"
                            style={{ background: m.sender.avatarColor }}
                          >
                            {m.sender.name[0]}
                          </div>
                        )}
                        <div className={`max-w-[60%] ${mine ? "text-right" : ""}`}>
                          {!mine && <div className="text-xs text-slate-500 mb-0.5">{m.sender.name}</div>}
                          <div
                            className={`inline-block px-3.5 py-2 rounded-2xl whitespace-pre-wrap ${
                              mine ? "bg-brand-400 text-white" : "bg-white border border-slate-200"
                            }`}
                          >
                            {m.content}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-1">
                            {new Date(m.createdAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form onSubmit={send} className="border-t border-slate-100 p-3 flex gap-2">
                  <input
                    className="input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="메시지를 입력하세요"
                  />
                  <button className="btn-primary">전송</button>
                </form>
              </>
            ) : (
              <div className="flex-1 grid place-items-center text-slate-400">채팅방을 선택해주세요.</div>
            )}
          </div>
        </div>
      </div>

      {creating && (
        <div className="fixed inset-0 bg-slate-900/40 grid place-items-center p-4" onClick={() => setCreating(false)}>
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">새 채팅방</h3>
            <form onSubmit={createRoom} className="space-y-3">
              <div>
                <label className="label">방 이름</label>
                <input className="input" value={newRoom.name} onChange={(e) => setNewRoom({ ...newRoom, name: e.target.value })} required />
              </div>
              <div>
                <label className="label">멤버 선택</label>
                <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                  {directory.filter((d) => d.id !== user?.id).map((d) => (
                    <label key={d.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={newRoom.memberIds.includes(d.id)}
                        onChange={(e) =>
                          setNewRoom((n) =>
                            e.target.checked
                              ? { ...n, memberIds: [...n.memberIds, d.id] }
                              : { ...n, memberIds: n.memberIds.filter((x) => x !== d.id) }
                          )
                        }
                      />
                      <div
                        className="w-7 h-7 rounded-full grid place-items-center text-white text-xs font-bold"
                        style={{ background: d.avatarColor ?? "#36D7B7" }}
                      >
                        {d.name[0]}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{d.name}</div>
                        <div className="text-xs text-slate-500">{d.team ?? ""}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>취소</button>
                <button className="btn-primary">만들기</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
