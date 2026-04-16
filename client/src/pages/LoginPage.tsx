import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Logo from "../components/Logo";

export default function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("test1234@hinest.local");
  const [password, setPassword] = useState("test1234!");
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
      <div className="w-full max-w-[420px]">
        <div className="flex items-center justify-center mb-10">
          <Logo size={32} />
        </div>

        <div className="mb-8">
          <h1 className="h-display text-center">다시 만나서 반가워요</h1>
          <p className="t-caption text-center mt-3">HiNest 사내 관리툴에 로그인하세요.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="input"
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {err && (
            <div className="text-[13px] font-bold text-danger px-1">{err}</div>
          )}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "로그인 중…" : "로그인하기"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/signup" className="text-[14px] font-bold text-ink-600 hover:text-brand-500">
            초대키로 회원가입 →
          </Link>
        </div>

        <div className="mt-14 text-center">
          <p className="text-[12px] text-ink-500">
            테스트 계정 · test1234@hinest.local / test1234!
          </p>
        </div>
      </div>
    </div>
  );
}
