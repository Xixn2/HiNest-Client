/**
 * 공통 포맷 유틸 — 여러 컴포넌트에서 중복 선언되던 헬퍼들을 한 곳으로 모음.
 */

/** 바이트 수를 사람이 읽기 쉬운 문자열로 변환 (B / KB / MB / GB) */
export function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
