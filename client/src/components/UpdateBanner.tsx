import { useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * 데스크톱 앱 업데이트 유도 배너.
 *
 * - 5분마다 서버의 /api/version 호출 → 최신 버전 정보 확인
 * - window.hinest.appVersion 과 비교해서 다르면 배너 노출
 * - "지금 재시작" 버튼 → window.hinest.relaunch() 호출로 앱 재시작
 * - "나중에" 버튼 → 30분 스누즈
 *
 * Electron 환경이 아닌 일반 웹 브라우저에서는 표시하지 않음 (isDesktop 체크).
 */

type VersionInfo = {
  latest: string;
  min: string;
  releasedAt: string;
  notes?: string;
};

const SNOOZE_KEY = "hinest.update.snoozeUntil";

function isSnoozed() {
  const v = localStorage.getItem(SNOOZE_KEY);
  if (!v) return false;
  return Date.now() < Number(v);
}

function snoozeFor(ms: number) {
  localStorage.setItem(SNOOZE_KEY, String(Date.now() + ms));
}

function compare(a: string, b: string) {
  // semver-ish 비교: 1.2.3 vs 1.2.4
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

export default function UpdateBanner() {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [show, setShow] = useState(false);
  const [hardUpdate, setHardUpdate] = useState(false);
  const [relaunching, setRelaunching] = useState(false);
  const loadedRef = useRef(false);

  const isDesktop = !!window.hinest?.isDesktop;
  const current = window.hinest?.appVersion ?? "";

  async function check() {
    if (!isDesktop || !current) return;
    try {
      const res = await api<VersionInfo>("/api/version");
      setInfo(res);
      const needsUpdate = compare(current, res.latest) < 0;
      const belowMin = compare(current, res.min) < 0;
      if (belowMin) {
        setHardUpdate(true);
        setShow(true);
      } else if (needsUpdate && !isSnoozed()) {
        setShow(true);
      } else {
        setShow(false);
      }
    } catch {}
  }

  useEffect(() => {
    if (!isDesktop) return;
    if (loadedRef.current) return;
    loadedRef.current = true;
    check();
    const t = setInterval(check, 5 * 60 * 1000); // 5분
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  async function onRelaunch() {
    setRelaunching(true);
    try {
      await window.hinest?.relaunch();
    } finally {
      setRelaunching(false);
    }
  }

  function onSnooze() {
    snoozeFor(30 * 60 * 1000); // 30분
    setShow(false);
  }

  if (!isDesktop || !show || !info) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-[80] w-[380px] panel p-0 overflow-hidden"
      style={{ boxShadow: "0 10px 28px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.12)" }}
    >
      <div
        className="px-4 py-3 flex items-start gap-3"
        style={{ background: "var(--c-brand)", color: "var(--c-brand-fg)" }}
      >
        <div className="w-8 h-8 rounded-lg bg-white/20 grid place-items-center flex-shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M21 3v5h-5M3 21v-5h5" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-extrabold">
            {hardUpdate ? "업데이트가 필요합니다" : "새 버전이 준비되었어요"}
          </div>
          <div className="text-[11.5px] opacity-90 tabular mt-0.5">
            {current} → <b>{info.latest}</b>
          </div>
        </div>
        {!hardUpdate && (
          <button
            onClick={onSnooze}
            className="text-white/80 hover:text-white"
            title="30분 뒤 다시 알림"
            aria-label="닫기"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <div className="p-4">
        <div className="text-[12.5px] text-ink-700 leading-relaxed whitespace-pre-wrap">
          {info.notes ?? "최신 HiNest 데스크톱 앱으로 업데이트할 수 있어요. 재시작하면 바로 적용됩니다."}
        </div>
        {hardUpdate && (
          <div className="mt-2 p-2 rounded-md bg-red-50 border border-red-100 text-[11.5px] text-red-700 font-bold">
            현재 버전은 더 이상 사용할 수 없어요. 업데이트 후 계속 이용할 수 있습니다.
          </div>
        )}
        <div className="flex items-center justify-end gap-2 mt-4">
          {!hardUpdate && (
            <button onClick={onSnooze} className="btn-ghost btn-xs">
              나중에
            </button>
          )}
          <button onClick={onRelaunch} className="btn-primary btn-xs" disabled={relaunching}>
            {relaunching ? "재시작 중…" : "지금 재시작"}
          </button>
        </div>
      </div>
    </div>
  );
}
