import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Logo from "../components/Logo";

export default function SignupPage() {
  const { user, signup } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({
    inviteKey: "",
    email: "",
    name: "",
    password: "",
  });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await signup(form);
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
          <h1 className="h-display text-center">회원가입</h1>
          <p className="t-caption text-center mt-3">관리자로부터 전달받은 초대키를 입력해주세요.</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="input font-mono tracking-wider"
            placeholder="초대키 (HN-XXXX-XXXX)"
            value={form.inviteKey}
            onChange={(e) => setForm((f) => ({ ...f, inviteKey: e.target.value.trim() }))}
            required
          />
          <input
            className="input"
            placeholder="이름"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="input"
            type="email"
            placeholder="이메일"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            required
            minLength={6}
          />
          {err && (
            <div className="text-[13px] font-bold text-danger px-1">{err}</div>
          )}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "가입 중…" : "가입하기"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-[14px] font-bold text-ink-600 hover:text-brand-500">
            이미 계정이 있나요? 로그인 →
          </Link>
        </div>
      </div>
    </div>
  );
}
