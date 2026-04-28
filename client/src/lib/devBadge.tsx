/**
 * \"HiNest 개발자\" 딱지 — 서버의 isDeveloper 플래그로만 판정.
 *
 * 종전엔 서버 필드가 누락된 캐시 응답 케이스를 위해 name === \"서지완\" fallback 이 있었으나,
 * 사용자가 이름을 \"서지완\" 으로 바꾸면 누구나 딱지가 떠 스푸핑 가능 — 보안 관점에서 fallback 제거.
 * 캐시가 낡아 isDeveloper 가 누락되어도 잠시 칩이 안 보일 뿐 다음 새로고침/refresh 에 정상화.
 */

export function isDevAccount(
  u: { isDeveloper?: boolean | null; [k: string]: any } | null | undefined,
): boolean {
  return !!u?.isDeveloper;
}

export function DevBadge({
  size = "sm",
  inline = true,
  iconOnly = false,
}: {
  size?: "sm" | "md";
  inline?: boolean;
  /** 좁은 자리(조직도 카드 등) 에선 라벨 빼고 그라데이션 원 + 코드 아이콘만. */
  iconOnly?: boolean;
}) {
  const fs = size === "md" ? 11.5 : 10;
  const pad = iconOnly ? 0 : size === "md" ? "2px 7px" : "1.5px 6px";
  const dim = iconOnly ? (size === "md" ? 18 : 14) : undefined;
  return (
    <span
      title="HiNest 개발자"
      style={{
        display: inline ? "inline-flex" : "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        padding: pad,
        width: dim,
        height: dim,
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
      <svg width={iconOnly ? (size === "md" ? 11 : 9) : fs - 1} height={iconOnly ? (size === "md" ? 11 : 9) : fs - 1} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
      {!iconOnly && "HiNest 개발자"}
    </span>
  );
}
