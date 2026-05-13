import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Logo from "../components/Logo";

/**
 * 로그인 페이지 — Toss 의 \"한 화면에 한 흐름\" 디자인 원칙을 따른다.
 *  - 카드/패널 없이 흰 배경 위에 큰 인사말 + 두 개의 입력 + 큰 primary 버튼
 *  - 입력 필드는 보더 대신 옅은 회색 fill (\#F4F6FA) — 포커스 시 브랜드 링
 *  - 부차 액션(가입 / 미리보기 / 앱 다운로드) 은 하단에 약하게
 */
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
    <div className="min-h-screen flex flex-col" style={{ background: "var(--c-surface)" }}>
      {/* 상단 — 로고만 살짝 */}
      <header className="px-6 pt-8 pb-4 flex items-center">
        <Logo size={20} />
      </header>

      {/* 본문 — 중앙 정렬, 한 단 */}
      <main className="flex-1 flex items-center justify-center px-6 pb-12">
        <div className="w-full max-w-[360px]">
          {/* 인사말 */}
          <div className="mb-9">
            <h1 className="text-[26px] font-extrabold text-ink-900 tracking-tight leading-tight">
              어서 오세요
            </h1>
            <p className="text-[14px] text-ink-500 mt-2 leading-relaxed">
              이메일과 비밀번호로 워크스페이스에 들어갈 수 있어요.
            </p>
          </div>

          {/* 폼 */}
          <form onSubmit={submit} className="space-y-3">
            <SoftInput
              type="email"
              placeholder="이메일"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
              maxLength={200}
            />
            <SoftInput
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
              maxLength={128}
            />

            {err && (
              <div
                className="text-[12.5px] font-semibold leading-snug"
                style={{ color: "var(--c-danger)", paddingTop: 2 }}
              >
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full transition disabled:opacity-60"
              style={{
                marginTop: 18,
                background: "var(--c-brand)",
                color: "#fff",
                height: 54,
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 800,
                letterSpacing: "-0.01em",
              }}
            >
              {loading ? "로그인 중…" : "로그인"}
            </button>
          </form>

          {/* 보조 액션 */}
          <div className="mt-5 flex items-center justify-center gap-4 text-[12.5px]">
            <Link
              to="/signup"
              className="text-ink-500 hover:text-ink-900 transition font-semibold"
            >
              초대키로 가입
            </Link>
            <span className="text-ink-300">·</span>
            <Link
              to="/preview"
              className="font-semibold transition"
              style={{ color: "var(--c-brand)" }}
            >
              로그인 없이 둘러보기
            </Link>
          </div>

          {/* 앱 다운로드 — 데스크톱 앱이 아닐 때만 */}
          {!window.hinest?.isDesktop && (
            <div className="mt-10 text-center">
              <Link
                to="/download"
                className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-400 hover:text-ink-700 transition"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                데스크톱 · 모바일 앱
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * Toss 톤의 입력 — 보더 없이 옅은 회색 fill, 포커스 시 브랜드 컬러 링.
 *  - 라벨이 필드 안 placeholder 로 떠 있다가 입력 시 살짝 위로(floating label 효과는 다음 단계).
 *  - 16px 폰트로 iOS Safari 자동 줌 방지.
 */
function SoftInput({
  type, placeholder, value, onChange, autoComplete, required, maxLength,
}: {
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      style={{
        background: "var(--c-surface-3)",
        borderRadius: 14,
        boxShadow: focused
          ? "0 0 0 2px color-mix(in srgb, var(--c-brand) 32%, transparent)"
          : "0 0 0 1px transparent",
        transition: "box-shadow 0.15s",
      }}
    >
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        style={{
          width: "100%",
          height: 54,
          padding: "0 18px",
          background: "transparent",
          border: 0,
          outline: "none",
          fontSize: 16,
          fontWeight: 600,
          color: "var(--c-text-1)",
          letterSpacing: "-0.01em",
          borderRadius: 14,
        }}
      />
    </div>
  );
}
