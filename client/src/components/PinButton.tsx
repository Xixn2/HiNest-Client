import { usePins, type PinTargetType } from "../pins";

/**
 * 재사용 가능한 "핀" 토글 버튼 — 상세 페이지 헤더나 리스트 hover 액션 등에서 사용.
 * 크기/톤은 부모 스타일 영향을 받도록 btn-icon 기반.
 */
export default function PinButton({
  type,
  id,
  label,
  size = 14,
  className = "btn-icon",
}: {
  type: PinTargetType;
  id: string;
  label?: string;
  size?: number;
  className?: string;
}) {
  const { isPinned, toggle } = usePins();
  const active = isPinned(type, id);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggle(type, id, label); }}
      className={`${className} ${active ? "text-amber-500" : "text-ink-400 hover:text-amber-500"}`}
      title={active ? "즐겨찾기 해제" : "즐겨찾기에 추가"}
      aria-pressed={active}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  );
}
