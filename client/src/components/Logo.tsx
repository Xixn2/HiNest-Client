export default function Logo({
  size = 22,
  showDot = true,
}: {
  size?: number;
  showDot?: boolean;
}) {
  const vbW = 152;
  const vbH = 48;
  const height = size * 1.55;
  const width = (height * vbW) / vbH;

  return (
    <div className="flex items-center gap-2 select-none" style={{ color: "var(--c-text)" }}>
      <svg width={width} height={height} viewBox={`0 0 ${vbW} ${vbH}`} xmlns="http://www.w3.org/2000/svg" aria-label="HiNest">
        <text
          x="0"
          y="26"
          fontFamily='"Pretendard Variable", Pretendard, -apple-system, sans-serif'
          fontWeight={900}
          fontSize={22}
          letterSpacing="-0.05em"
          fill="currentColor"
        >
          Hi
        </text>
        <text
          x="35"
          y="44"
          fontFamily='"Pretendard Variable", Pretendard, -apple-system, sans-serif'
          fontWeight={900}
          fontSize={48}
          letterSpacing="-0.06em"
          fill="currentColor"
        >
          NEST
        </text>
        {showDot && <circle cx={147} cy={42} r={4} fill="#3B5CF0" />}
      </svg>
    </div>
  );
}
