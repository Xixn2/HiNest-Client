import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";

export type PinTargetType = "DOCUMENT" | "MEETING" | "CHAT_ROOM" | "PROJECT" | "NOTICE";

export interface Pin {
  id: string;
  targetType: PinTargetType;
  targetId: string;
  label: string | null;
  sortOrder: number;
  createdAt: string;
  name: string | null;
  meta: any;
  missing: boolean;
}

interface PinsCtx {
  pins: Pin[];
  ready: boolean;
  isPinned: (type: PinTargetType, id: string) => boolean;
  toggle: (type: PinTargetType, id: string, label?: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<PinsCtx | null>(null);

export function PinsProvider({ children }: { children: ReactNode }) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [ready, setReady] = useState(false);
  const loadedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ pins: Pin[] }>("/api/pins");
      setPins(r.pins);
    } catch {
      // 로그인 실패 등은 조용히 무시 — 로그인 후 재시도됨.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    refresh();
  }, [refresh]);

  const isPinned = useCallback(
    (type: PinTargetType, id: string) => pins.some((p) => p.targetType === type && p.targetId === id),
    [pins],
  );

  const toggle = useCallback(
    async (type: PinTargetType, id: string, label?: string) => {
      const existing = pins.find((p) => p.targetType === type && p.targetId === id);
      if (existing) {
        // 낙관적 제거.
        const prev = pins;
        setPins((xs) => xs.filter((p) => p.id !== existing.id));
        try {
          await api(`/api/pins/${existing.id}`, { method: "DELETE" });
        } catch {
          setPins(prev);
        }
      } else {
        try {
          await api("/api/pins", { method: "POST", json: { targetType: type, targetId: id, label } });
          await refresh();
        } catch {}
      }
    },
    [pins, refresh],
  );

  const reorder = useCallback(
    async (ids: string[]) => {
      // 낙관적 재정렬.
      const prev = pins;
      const byId = new Map(pins.map((p) => [p.id, p]));
      const next = ids.map((id, i) => {
        const p = byId.get(id);
        return p ? { ...p, sortOrder: i } : null;
      }).filter(Boolean) as Pin[];
      setPins(next);
      try {
        await api("/api/pins/reorder", { method: "POST", json: { ids } });
      } catch {
        setPins(prev);
      }
    },
    [pins],
  );

  const value = useMemo<PinsCtx>(() => ({ pins, ready, isPinned, toggle, reorder, refresh }), [pins, ready, isPinned, toggle, reorder, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePins() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePins must be used within PinsProvider");
  return v;
}

/** 리소스 링크 URL 매핑 — 사이드바에서 클릭 시 바로 이동. */
export function pinLinkUrl(p: Pin): string {
  switch (p.targetType) {
    case "DOCUMENT":
      return `/documents?docId=${p.targetId}`;
    case "MEETING":
      return `/meetings?id=${p.targetId}`;
    case "NOTICE":
      return `/notice?id=${p.targetId}`;
    case "PROJECT":
      return `/projects/${p.targetId}`;
    case "CHAT_ROOM":
      // 사이드바에서 채팅방 핀 클릭 시 ChatFab 을 열어 해당 방으로 이동.
      return `#chat:${p.targetId}`;
    default:
      return "/";
  }
}
