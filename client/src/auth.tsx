import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearApiCache } from "./api";

export type User = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  team?: string | null;
  position?: string | null;
  avatarColor?: string;
  avatarUrl?: string | null;
  superAdmin?: boolean;
  employeeNo?: string | null;
  presenceStatus?: string | null;
  presenceMessage?: string | null;
  presenceUpdatedAt?: string | null;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { inviteKey: string; email: string; name: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>({} as Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: User }>("/api/me");
      setUser(res.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api<{ user: User }>("/api/auth/login", {
      method: "POST",
      json: { email, password },
    });
    // 토큰 만료 후 logout 을 거치지 않고 다른 계정으로 재로그인할 때 이전 사용자 캐시가
    // 섬광처럼 보이는 것을 방지. logout 에서와 동일하게 세션 캐시를 싹 비움.
    clearApiCache();
    setUser(res.user);
  };

  const signup = async (d: { inviteKey: string; email: string; name: string; password: string }) => {
    const res = await api<{ user: User }>("/api/auth/signup", {
      method: "POST",
      json: d,
    });
    clearApiCache();
    setUser(res.user);
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    // 다른 사용자가 로그인했을 때 이전 사용자의 프로젝트/캘린더가 깜빡 보이는 사고 방지.
    clearApiCache();
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, signup, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
