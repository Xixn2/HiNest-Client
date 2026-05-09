import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { clearApiCache } from "../api";

/**
 * /preview 진입점 — 미리보기 모드 플래그 세팅 + 가짜 사용자로 부트스트랩.
 *  1) window.__HINEST_PREVIEW__ = true 로 모든 api() 호출이 mock 응답
 *  2) auth.refresh() 가 /api/me 를 호출 → mock 이 \"김데모\" 사용자 반환
 *  3) 루트로 리다이렉트해 평소처럼 AppLayout 렌더
 */
export default function PreviewEntry() {
  const { refresh } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    import("../lib/previewMock").then((m) => m.enablePreview());
    clearApiCache();
    refresh().then(() => nav("/", { replace: true }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen grid place-items-center text-ink-500 text-[13px]">
      미리보기를 준비하는 중…
    </div>
  );
}
