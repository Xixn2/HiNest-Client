import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";

/**
 * 기능 플래그 클라 — 부트 시 1번 fetch, 이후 useFeatureFlag(key) 로 동기 조회.
 * 로그인 컨텍스트가 바뀌면 (login/logout/refresh) 다시 가져온다.
 */

type FlagsCtx = {
  flags: Record<string, boolean>;
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<FlagsCtx>({ flags: {}, loading: true, refresh: async () => {} });

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const r = await api<{ flags: Record<string, boolean> }>("/api/feature-flags");
      setFlags(r.flags ?? {});
    } catch {
      setFlags({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return <Ctx.Provider value={{ flags, loading, refresh }}>{children}</Ctx.Provider>;
}

export function useFeatureFlag(key: string): boolean {
  return !!useContext(Ctx).flags[key];
}

/** 한 번에 여러 키 조회. */
export function useFeatureFlags(): Record<string, boolean> {
  return useContext(Ctx).flags;
}

/** \<FeatureGate flag="foo"\>... 조건부 렌더링 helper. */
export function FeatureGate({ flag, fallback = null, children }: { flag: string; fallback?: React.ReactNode; children: React.ReactNode }) {
  const on = useFeatureFlag(flag);
  return <>{on ? children : fallback}</>;
}
