import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { clearApiCache } from "../api";
import { enablePreview } from "../lib/previewMock";

/**
 * /preview 진입점 — 미리보기 모드 플래그 세팅 + 가짜 사용자로 부트스트랩.
 *  1) enablePreview() 로 window 플래그 동기 세팅
 *  2) auth.refresh() 가 /api/me 를 호출 → mock 이 \"김데모\" 사용자 반환
 *  3) 루트로 리다이렉트해 평소처럼 AppLayout 렌더
 *
 * 주의: dynamic import 로 enablePreview 를 가져오면 refresh() 보다 늦게 실행돼
 * mock 이 안 걸리고 401 받음 → 로그인으로 튕기는 버그가 있었다. 정적 import 로 고정.
 */
export default function PreviewEntry() {
  const { refresh } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    enablePreview();
    clearApiCache();
    refresh().then(() => nav("/", { replace: true }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="min-h-screen grid place-items-center px-6"
      style={{ background: "linear-gradient(180deg, var(--c-surface-1) 0%, var(--c-surface-2) 100%)" }}
    >
      <div className="text-center max-w-[420px]">
        <div
          className="w-14 h-14 mx-auto rounded-2xl grid place-items-center mb-5"
          style={{
            background: "linear-gradient(135deg, var(--c-brand) 0%, #7C3AED 100%)",
            boxShadow: "0 10px 28px rgba(67,56,202,0.28)",
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </div>
        <div className="text-[20px] font-extrabold text-ink-900 tracking-tight">HiNest 미리보기</div>
        <div className="text-[13px] text-ink-500 mt-2 leading-relaxed">
          로그인 없이 실제 화면을 둘러보실 수 있어요. <br />
          데모 데이터로 가입하지 않고도 모든 기능을 미리 체험해 보세요.
        </div>
        <div className="mt-6 inline-flex items-center gap-2 text-[12px] text-ink-500">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: "var(--c-brand)", animation: "hinest-pulse 1.1s ease-in-out infinite" }}
          />
          잠시만 기다려 주세요…
        </div>
      </div>
      <style>{`@keyframes hinest-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }`}</style>
    </div>
  );
}
