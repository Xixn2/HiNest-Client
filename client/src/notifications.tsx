import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { deliverPendingNotifications, markSeen } from "./lib/desktopNotify";

export type NotifType = "NOTICE" | "DM" | "APPROVAL_REQUEST" | "APPROVAL_REVIEW" | "MENTION" | "SYSTEM";

export type Notif = {
  id: string;
  type: NotifType;
  title: string;
  body?: string;
  linkUrl?: string;
  actorName?: string;
  readAt?: string | null;
  createdAt: string;
};

const CHAT_TYPES: NotifType[] = ["DM", "MENTION"];
const isChatType = (t: NotifType) => CHAT_TYPES.includes(t);

type Ctx = {
  items: Notif[];            // 전체 (벨+채팅 포함)
  bellItems: Notif[];        // 벨에 표시할 것 (DM/MENTION 제외)
  unread: number;            // 벨 미읽음 (DM/MENTION 제외)
  chatUnread: number;        // 채팅 미읽음 (DM/MENTION)
  /** 최초 서버에서 알림 목록을 받아온 뒤 true — 펄스 로직이 이 전엔 동작하지 않도록 함 */
  ready: boolean;
  reload: () => Promise<void>;
  markRead: (ids?: string[], all?: boolean) => Promise<void>;
  /** 특정 채팅방에 들어갔을 때 해당 방의 DM/MENTION 알림 일괄 읽음 처리 */
  markRoomRead: (roomId: string) => Promise<void>;
};

const NotificationCtx = createContext<Ctx>({
  items: [],
  bellItems: [],
  unread: 0,
  chatUnread: 0,
  ready: false,
  reload: async () => {},
  markRead: async () => {},
  markRoomRead: async () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [ready, setReady] = useState(false);
  const initialRef = useRef(true);
  const esRef = useRef<EventSource | null>(null);

  const bellItems = useMemo(() => items.filter((n) => !isChatType(n.type)), [items]);
  const unread = useMemo(
    () => bellItems.filter((n) => !n.readAt).length,
    [bellItems]
  );
  const chatUnread = useMemo(
    () => items.filter((n) => !n.readAt && isChatType(n.type)).length,
    [items]
  );

  const reload = useCallback(async () => {
    try {
      const res = await api<{ notifications: Notif[]; unread: number }>("/api/notification");
      setItems(res.notifications);
      setReady(true);
      const unreadItems = res.notifications.filter((n) => !n.readAt);
      if (initialRef.current) {
        initialRef.current = false;
        markSeen(unreadItems.map((n) => n.id));
      } else {
        deliverPendingNotifications(
          unreadItems.map((n) => ({ id: n.id, title: n.title, body: n.body, linkUrl: n.linkUrl }))
        );
      }
    } catch {}
  }, []);

  const markRead = useCallback(async (ids?: string[], all?: boolean) => {
    // 낙관적 업데이트 — API 왕복을 기다리지 않고 즉시 벨/룸 뱃지에서 숫자 사라지게.
    // 실패해도 다음 reload(30s) / SSE 에서 서버가 진실을 다시 싱크하므로 롤백 불필요.
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) =>
        (all || (ids && ids.includes(n.id))) && !n.readAt
          ? { ...n, readAt: now }
          : n
      )
    );
    try {
      await api("/api/notification/read", {
        method: "POST",
        json: all ? { all: true } : { ids: ids ?? [] },
      });
    } catch {}
  }, []);

  const markRoomRead = useCallback(async (roomId: string) => {
    // 현재 items 에서 해당 방에 연결된 미읽음 DM/MENTION 을 추려서 즉시 읽음 처리.
    // linkUrl 패턴은 /chat?room=<roomId>
    const now = new Date().toISOString();
    let targetIds: string[] = [];
    setItems((prev) => {
      const next = prev.map((n) => {
        if (!n.readAt && isChatType(n.type) && n.linkUrl && n.linkUrl.includes(`room=${roomId}`)) {
          targetIds.push(n.id);
          return { ...n, readAt: now };
        }
        return n;
      });
      return next;
    });
    if (targetIds.length === 0) return;
    try {
      await api("/api/notification/read", { method: "POST", json: { ids: targetIds } });
    } catch {}
  }, []);

  useEffect(() => {
    reload();

    let retry: number | null = null;
    // 채팅 이벤트는 별도 컴포넌트(ChatMiniApp) 에서 소비하므로 DOM CustomEvent 로
    // 재방송한다. 기존 "chat:open" / "chat:open-room" 같은 in-app event 와 동일 패턴.
    const rebroadcast = (name: "chat:sse-message" | "chat:sse-update" | "chat:sse-room", payload: unknown) => {
      try {
        window.dispatchEvent(new CustomEvent(name, { detail: payload }));
      } catch {}
    };
    function connect() {
      try {
        const es = new EventSource("/api/notification/stream", { withCredentials: true });
        esRef.current = es;
        es.addEventListener("notification", (ev: MessageEvent) => {
          try {
            const n = JSON.parse(ev.data) as Notif;
            setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
            deliverPendingNotifications([
              { id: n.id, title: n.title, body: n.body, linkUrl: n.linkUrl },
            ]);
            // 서버 정렬/중복제거 기준으로 한 번 더 동기화 — 혹시 SSE 가 한 건도 빠뜨리면
            // 벨 목록이 카운트만 맞고 항목이 비는 현상을 막기 위함.
            reload();
          } catch {}
        });
        // 채팅 실시간 푸시 — ChatMiniApp 이 window 리스너로 수신.
        es.addEventListener("chat:message", (ev: MessageEvent) => {
          try { rebroadcast("chat:sse-message", JSON.parse(ev.data)); } catch {}
        });
        es.addEventListener("chat:update", (ev: MessageEvent) => {
          try { rebroadcast("chat:sse-update", JSON.parse(ev.data)); } catch {}
        });
        es.addEventListener("chat:room", (ev: MessageEvent) => {
          try { rebroadcast("chat:sse-room", JSON.parse(ev.data)); } catch {}
        });
        es.onerror = () => {
          es.close();
          esRef.current = null;
          retry = window.setTimeout(connect, 3000);
        };
      } catch {
        retry = window.setTimeout(connect, 3000);
      }
    }
    connect();

    const t = setInterval(reload, 30_000);

    function onVisibility() {
      if (document.visibilityState === "visible") reload();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (retry) clearTimeout(retry);
      clearInterval(t);
      esRef.current?.close();
      esRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line
  }, []);

  return (
    <NotificationCtx.Provider value={{ items, bellItems, unread, chatUnread, ready, reload, markRead, markRoomRead }}>
      {children}
    </NotificationCtx.Provider>
  );
}

export const useNotifications = () => useContext(NotificationCtx);
