import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  value: string; // "YYYY-MM"
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  className?: string;
};

function parse(v: string) {
  const [y, m] = v.split("-").map(Number);
  return { y: y || new Date().getFullYear(), m: m || new Date().getMonth() + 1 };
}
function format(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

export default function MonthPicker({ value, onChange, min, max, className }: Props) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(() => parse(value).y);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { y: selY, m: selM } = parse(value);

  useEffect(() => { setViewYear(parse(value).y); }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const t = setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("keydown", onKey);
    }, 30);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const minP = min ? parse(min) : null;
  const maxP = max ? parse(max) : null;

  function isDisabled(y: number, m: number) {
    if (minP && (y < minP.y || (y === minP.y && m < minP.m))) return true;
    if (maxP && (y > maxP.y || (y === maxP.y && m > maxP.m))) return true;
    return false;
  }

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        return {
          m,
          label: `${m}월`,
          disabled: isDisabled(viewYear, m),
        };
      }),
    // eslint-disable-next-line
    [viewYear, min, max]
  );

  function pick(m: number) {
    if (isDisabled(viewYear, m)) return;
    onChange(format(viewYear, m));
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="input text-left inline-flex items-center gap-2 min-w-[160px]"
        style={{ paddingRight: 36 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-ink-500">
          <rect x="3" y="5" width="18" height="16" rx="2.5" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span className="flex-1 font-semibold">{selY}년 {selM}월</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 sm:right-auto sm:left-0 z-50 mt-2 panel shadow-pop p-3 w-[280px] max-w-[calc(100vw-16px)]">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              className="btn-icon w-8 h-8"
              onClick={() => setViewYear((y) => y - 1)}
              title="이전 해"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <div className="text-[14px] font-bold text-ink-900 tabular">{viewYear}</div>
            <button
              type="button"
              className="btn-icon w-8 h-8"
              onClick={() => setViewYear((y) => y + 1)}
              title="다음 해"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {months.map(({ m, label, disabled }) => {
              const isSelected = viewYear === selY && m === selM;
              const now = new Date();
              const isThisMonth = viewYear === now.getFullYear() && m === now.getMonth() + 1;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(m)}
                  disabled={disabled}
                  className={`h-[36px] rounded-lg text-[13px] font-bold transition ${
                    isSelected
                      ? "text-white"
                      : disabled
                      ? "text-ink-300 cursor-not-allowed"
                      : isThisMonth
                      ? "text-brand-600 ring-1 ring-inset"
                      : "text-ink-800 hover:bg-ink-100"
                  }`}
                  style={
                    isSelected
                      ? { background: "var(--c-brand)" }
                      : isThisMonth
                      ? { boxShadow: "inset 0 0 0 1px var(--c-brand)" }
                      : undefined
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="text-[12px] font-bold text-ink-500 hover:text-ink-800"
            >
              초기화
            </button>
            <button
              type="button"
              onClick={() => {
                const n = new Date();
                const v = format(n.getFullYear(), n.getMonth() + 1);
                onChange(v);
                setOpen(false);
              }}
              className="text-[12px] font-bold text-brand-600 hover:text-brand-700"
            >
              이번 달
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
