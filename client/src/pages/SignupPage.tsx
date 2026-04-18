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
      <div className="w-full max-w-[400px]">
        <div className="flex items-center justify-center mb-7">
          <Logo size={22} />
        </div>

        <div className="panel p-7">
          <div className="mb-5">
            <h1 className="text-[18px] font-bold text-ink-900 tracking-tight">계정 만들기</h1>
            <p className="t-caption mt-1">관리자로부터 전달받은 초대키가 필요합니다.</p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="field-label">초대키</label>
              <input
                className="input font-mono tracking-[0.05em]"
                placeholder="HN-XXXX-XXXX"
                value={form.inviteKey}
                onChange={(e) => setForm((f) => ({ ...f, inviteKey: e.target.value.trim() }))}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">이름</label>
                <input
                  className="input"
                  placeholder="홍길동"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="field-label">업무 이메일</label>
                <input
                  className="input"
                  type="email"
                  placeholder="name@company.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div>
              <label className="field-label">비밀번호 <span className="text-ink-500 font-normal">(6자 이상)</span></label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                required
                minLength={6}
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
              {loading ? "가입 중…" : "가입하기"}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-ink-100 flex items-center justify-between">
            <span className="t-caption">이미 계정이 있나요?</span>
            <Link to="/login" className="text-[12px] font-semibold text-brand-600 hover:text-brand-700">
              로그인 →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
