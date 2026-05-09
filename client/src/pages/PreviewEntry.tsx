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
    <div className="min-h-screen grid place-items-center text-ink-500 text-[13px]">
      미리보기를 준비하는 중…
    </div>
  );
}
