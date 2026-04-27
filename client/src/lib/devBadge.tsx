/**
 * \"HiNest 개발자\" 딱지 — 서지완(이 앱 만든 사람) 계정에만 노출.
 *
 * 식별 기준은 이름. 동일 회사에 동명 이인이 생기면 그 때 DB 컬럼으로 승격.
 * (지금은 한 명이라 어디든 import 해서 isDevAccount(user) 만 체크하면 됨.)
 */

export function isDevAccount(u: { name?: string | null } | null | undefined): boolean {
  if (!u) return false;
  return u.name === "서지완";
}

export function DevBadge({
  size = "sm",
  inline = true,
}: {
  size?: "sm" | "md";
  inline?: boolean;
}) {
  const fs = size === "md" ? 11.5 : 10;
  const pad = size === "md" ? "2px 7px" : "1.5px 6px";
  return (
    <span
      title="HiNest 를 만든 개발자"
      style={{
        display: inline ? "inline-flex" : "flex",
        alignItems: "center",
        gap: 3,
        padding: pad,
        borderRadius: 999,
        fontSize: fs,
        fontWeight: 800,
        letterSpacing: "0.02em",
        // 브랜드 그라데이션 — 시각적으로 확 띄게.
        background: "linear-gradient(135deg, #3B5CF0 0%, #7C3AED 100%)",
        color: "#fff",
        whiteSpace: "nowrap",
        flexShrink: 0,
        boxShadow: "0 1px 2px rgba(60,75,200,0.25)",
      }}
    >
      <svg width={fs - 1} height={fs - 1} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
      HiNest 개발자
    </span>
  );
}
