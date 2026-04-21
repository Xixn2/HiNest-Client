import { useEffect, useMemo, useRef, useState } from "react";
import { getHoliday } from "../lib/holidays";

type Mode = "datetime" | "date";

type Props = {
  value: string; // datetime: "YYYY-MM-DDTHH:mm" | date: "YYYY-MM-DD"
  onChange: (v: string) => void;
  mode?: Mode;
  min?: string;
  placeholder?: string;
  className?: string;
};

function pad(n: number) { return String(n).padStart(2, "0"); }

function parseValue(v: string, mode: Mode) {
  if (!v) return null;
  if (mode === "datetime") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return null;
    return {
      y: +m[1], m: +m[2], d: +m[3], h: +m[4], mi: +m[5],
    };
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: +m[1], m: +m[2], d: +m[3], h: 0, mi: 0 };
}

function formatOut(state: { y: number; m: number; d: number; h: number; mi: number }, mode: Mode) {
  if (mode === "date") return `${state.y}-${pad(state.m)}-${pad(state.d)}`;
  return `${state.y}-${pad(state.m)}-${pad(state.d)}T${pad(state.h)}:${pad(state.mi)}`;
}

function displayLabel(v: string, mode: Mode) {
  const p = parseValue(v, mode);
  if (!p) return "";
  const date = `${p.y}.${pad(p.m)}.${pad(p.d)}`;
  if (mode === "date") return date;
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  const meridiem = p.h < 12 ? "오전" : "오후";
  return `${date} ${meridiem} ${pad(h12)}:${pad(p.mi)}`;
}

export default function DateTimePicker({
  value, onChange, mode = "datetime", min, placeholder, className,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // 뷰 상태
  const [view, setView] = useState(() => {
    const p = parseValue(value, mode) ?? (() => {
      const n = new Date();
      return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate(), h: n.getHours(), mi: Math.floor(n.getMinutes() / 5) * 5 };
    })();
    return p;
  });

  useEffect(() => {
    const p = parseValue(value, mode);
    if (p) setView(p);
  }, [value, mode]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      // 팝오버 자체(Portal 로 body 에 붙음)에 대한 클릭도 허용
      const pop = document.getElementById("dtp-popover");
      if (pop?.contains(target)) return;
      setOpen(false);
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

  // 팝오버 위치 계산 (뷰포트 경계 보정)
  useEffect(() => {
    if (!open) return;
    function recalc() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const margin = 8;
      // 모바일(좁은 뷰포트)에서는 팝오버를 화면 폭에 맞춰 축소하고
      // datetime 모드에서도 시간 영역을 캘린더 아래로 쌓는다.
      const maxW = window.innerWidth - margin * 2;
      const idealW = mode === "datetime" ? 560 : 320;
      const PW = Math.min(idealW, maxW);
      const PH = 400; // 대략 높이
      let left = r.left;
      let top = r.bottom + 6;
      if (left + PW > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - PW - margin);
      }
      if (left < margin) left = margin;
      if (top + PH > window.innerHeight - margin) {
        const above = r.top - PH - 6;
        top = above > margin ? above : Math.max(margin, window.innerHeight - PH - margin);
      }
      setPopoverPos({ top, left, width: PW });
    }
    recalc();
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [open, mode]);

  const minP = useMemo(() => (min ? parseValue(min, mode) : null), [min, mode]);

  function isBeforeMin(y: number, m: number, d: number) {
    if (!minP) return false;
    if (y < minP.y) return true;
    if (y > minP.y) return false;
    if (m < minP.m) return true;
    if (m > minP.m) return false;
    return d < minP.d;
  }

  // 캘린더 그리드 (이전/다음달 포함 6주)
  const calendar = useMemo(() => {
    const first = new Date(view.y, view.m - 1, 1);
    const startDow = first.getDay();
    const total = new Date(view.y, view.m, 0).getDate();
    const prevTotal = new Date(view.y, view.m - 1, 0).getDate();

    const cells: { y: number; m: number; d: number; inMonth: boolean }[] = [];
    // 앞 채우기
    for (let i = startDow - 1; i >= 0; i--) {
      const d = prevTotal - i;
      const pm = view.m === 1 ? 12 : view.m - 1;
      const py = view.m === 1 ? view.y - 1 : view.y;
      cells.push({ y: py, m: pm, d, inMonth: false });
    }
    for (let d = 1; d <= total; d++) cells.push({ y: view.y, m: view.m, d, inMonth: true });
    // 뒤 채우기 (6주 = 42칸)
    let nd = 1;
    while (cells.length < 42) {
      const nm = view.m === 12 ? 1 : view.m + 1;
      const ny = view.m === 12 ? view.y + 1 : view.y;
      cells.push({ y: ny, m: nm, d: nd++, inMonth: false });
    }
    return cells;
  }, [view.y, view.m]);

  function commit(next: Partial<typeof view>) {
    const merged = { ...view, ...next };
    setView(merged);
    onChange(formatOut(merged, mode));
  }

  function pickDay(c: { y: number; m: number; d: number }) {
    if (isBeforeMin(c.y, c.m, c.d)) return;
    commit({ y: c.y, m: c.m, d: c.d });
    if (mode === "date") setOpen(false);
  }

  function moveMonth(delta: number) {
    let nm = view.m + delta;
    let ny = view.y;
    while (nm < 1) { nm += 12; ny -= 1; }
    while (nm > 12) { nm -= 12; ny += 1; }
    setView((v) => ({ ...v, y: ny, m: nm }));
  }

  const today = new Date();
  const selected = parseValue(value, mode);

  return (
    <div ref={wrapRef} className={`relative ${className ?? ""}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="input text-left inline-flex items-center gap-2 w-full"
        style={{ paddingRight: 36 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-ink-500">
          <rect x="3" y="5" width="18" height="16" rx="2.5" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        <span className={`flex-1 font-semibold ${value ? "" : "text-ink-400"}`}>
          {value ? displayLabel(value, mode) : placeholder ?? (mode === "date" ? "날짜 선택" : "날짜·시간 선택")}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && popoverPos && (
        <div
          id="dtp-popover"
          className="fixed z-[70] panel shadow-pop p-3"
          style={{ top: popoverPos.top, left: popoverPos.left, width: popoverPos.width }}
        >
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            {/* 캘린더 영역 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-bold text-ink-900 tabular">{view.y}년 {view.m}월</div>
                <div className="flex items-center gap-0.5">
                  <button type="button" className="btn-icon w-7 h-7" onClick={() => moveMonth(-12)} title="이전 해">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m11 17-5-5 5-5M18 17l-5-5 5-5" />
                    </svg>
                  </button>
                  <button type="button" className="btn-icon w-7 h-7" onClick={() => moveMonth(-1)} title="이전 달">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                  </button>
                  <button type="button" className="btn-icon w-7 h-7" onClick={() => moveMonth(1)} title="다음 달">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                  <button type="button" className="btn-icon w-7 h-7" onClick={() => moveMonth(12)} title="다음 해">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 17 5-5-5-5M13 17l5-5-5-5" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {["일","월","화","수","목","금","토"].map((d, i) => (
                  <div
                    key={d}
                    className={`text-center text-[11px] font-bold py-1 ${i === 0 ? "text-rose-500" : i === 6 ? "text-accent-500" : "text-ink-500"}`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {calendar.map((c, i) => {
                  const d = new Date(c.y, c.m - 1, c.d);
                  const holiday = getHoliday(d);
                  const dow = d.getDay();
                  const disabled = isBeforeMin(c.y, c.m, c.d);
                  const isToday =
                    c.y === today.getFullYear() &&
                    c.m === today.getMonth() + 1 &&
                    c.d === today.getDate();
                  const isSelected =
                    selected && c.y === selected.y && c.m === selected.m && c.d === selected.d;

                  let textClass = "text-ink-800";
                  if (!c.inMonth) textClass = "text-ink-300";
                  else if (holiday || dow === 0) textClass = "text-rose-500";
                  else if (dow === 6) textClass = "text-accent-500";

                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={disabled}
                      onClick={() => pickDay(c)}
                      title={holiday?.name}
                      className={`h-[32px] rounded-md text-[12.5px] font-semibold tabular transition ${
                        isSelected
                          ? "text-white"
                          : disabled
                          ? "text-ink-300 cursor-not-allowed"
                          : isToday
                          ? "ring-1 ring-inset"
                          : "hover:bg-ink-100"
                      } ${isSelected ? "" : textClass}`}
                      style={
                        isSelected
                          ? { background: "var(--c-brand)" }
                          : isToday
                          ? { boxShadow: "inset 0 0 0 1px var(--c-brand)" }
                          : undefined
                      }
                    >
                      {c.d}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 시간 영역 (datetime 전용) */}
            {mode === "datetime" && (
              <div className="w-full sm:w-[180px] sm:border-l border-t sm:border-t-0 border-ink-100 sm:pl-3 pt-3 sm:pt-0">
                <div className="text-[12px] font-bold text-ink-800 mb-2">시간</div>

                {/* 시 + 분 큰 숫자 */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <div className="text-[10px] font-bold text-ink-500 mb-1 uppercase tracking-wider">시</div>
                    <select
                      className="input text-[13px] text-center"
                      value={view.h}
                      onChange={(e) => commit({ h: Number(e.target.value) })}
                    >
                      {Array.from({ length: 24 }, (_, h) => (
                        <option key={h} value={h}>{pad(h)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-ink-500 mb-1 uppercase tracking-wider">분</div>
                    <select
                      className="input text-[13px] text-center"
                      value={view.mi}
                      onChange={(e) => commit({ mi: Number(e.target.value) })}
                    >
                      {Array.from({ length: 60 }, (_, m) => (
                        <option key={m} value={m}>{pad(m)}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 퀵 시간 */}
                <div className="text-[10px] font-bold text-ink-500 mb-1 uppercase tracking-wider">빠른 선택</div>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { l: "지금", fn: () => { const n = new Date(); commit({ h: n.getHours(), mi: n.getMinutes() }); } },
                    { l: "09:00", fn: () => commit({ h: 9, mi: 0 }) },
                    { l: "10:00", fn: () => commit({ h: 10, mi: 0 }) },
                    { l: "12:00", fn: () => commit({ h: 12, mi: 0 }) },
                    { l: "14:00", fn: () => commit({ h: 14, mi: 0 }) },
                    { l: "18:00", fn: () => commit({ h: 18, mi: 0 }) },
                  ].map((q) => (
                    <button
                      key={q.l}
                      type="button"
                      onClick={q.fn}
                      className="h-[30px] rounded-md text-[11.5px] font-bold text-ink-700 hover:bg-ink-100 border border-ink-150"
                    >
                      {q.l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-ink-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className="text-[12px] font-bold text-ink-500 hover:text-ink-800"
            >
              초기화
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const n = new Date();
                  commit({ y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate(), h: n.getHours(), mi: n.getMinutes() });
                }}
                className="text-[12px] font-bold text-ink-600 hover:text-ink-900"
              >
                오늘
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-primary btn-xs"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
