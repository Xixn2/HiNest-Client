import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * 결재 대기 / 내 미결 개수 — 사이드바 배지 + 탭 표시용.
 * - 30초 폴링 + 탭 가시성 복귀 시 즉시 새로고침.
 * - 다른 페이지에서 결재 처리 후 즉시 반영하려면 \`window.dispatchEvent(new Event("hinest:approvalCountsRefresh"))\`.
 */
export function useApprovalCounts() {
  const [counts, setCounts] = useState<{ pending: number; mine: number }>({ pending: 0, mine: 0 });

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await api<{ pending: number; mine: number }>("/api/approval/counts");
        if (alive) setCounts(r);
      } catch { /* 401 등은 무시 */ }
    }
    load();
    const t = setInterval(load, 30_000);
    function onVis() { if (document.visibilityState === "visible") load(); }
    function onSignal() { load(); }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("hinest:approvalCountsRefresh", onSignal);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("hinest:approvalCountsRefresh", onSignal);
    };
  }, []);

  return counts;
}

/** 결재 화면이 처리 후 카운트 즉시 갱신을 트리거할 때 사용. */
export function refreshApprovalCounts() {
  window.dispatchEvent(new Event("hinest:approvalCountsRefresh"));
}
