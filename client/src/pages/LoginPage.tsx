import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Logo from "../components/Logo";

export default function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(email, password);
      nav("/");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6 bg-ink-50">
      <div className="w-full max-w-[380px]">
        <div className="flex items-center justify-center mb-7">
          <Logo size={22} />
        </div>

        <div className="panel p-7">
          <div className="mb-5">
            <h1 className="text-[18px] font-bold text-ink-900 tracking-tight">로그인</h1>
            <p className="t-caption mt-1">HiNest 워크스페이스에 접속합니다.</p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="field-label">이메일 또는 사내 ID</label>
              <input
                className="input"
                type="text"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="field-label">비밀번호</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {err && (
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-red-50 border border-red-100 text-[12px] font-semibold text-red-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                {err}
              </div>
            )}
            <button className="btn-primary btn-lg w-full mt-1" disabled={loading}>
              {loading ? "로그인 중…" : "로그인"}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-ink-100 flex items-center justify-between">
            <span className="t-caption">아직 계정이 없나요?</span>
            <Link to="/signup" className="text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              초대키로 가입 →
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
