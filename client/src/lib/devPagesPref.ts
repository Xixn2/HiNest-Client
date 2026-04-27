/**
 * 개발자 본인의 \"개발 중 페이지 접근\" 토글 — localStorage 기반.
 * 개발자 권한이 없는 사용자에게도 키는 존재할 수 있지만 RouteVisibilityGate 가 무시.
 */

const KEY = "hinest.devPagesEnabled";

export function getDevPagesEnabled(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function setDevPagesEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
    window.dispatchEvent(new Event("hinest:devPagesChange"));
  } catch {}
}
