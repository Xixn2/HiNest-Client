import { useEffect, useState } from "react";

/**
 * 웹앱 (PWA) 업데이트 배너.
 *
 * 흐름:
 * 1) main.tsx 가 service worker 를 등록하고, 새 SW 가 "installed" 상태가 되면
 *    `hinest:update-ready` 커스텀 이벤트를 window 에 발사한다.
 * 2) 이 컴포넌트는 해당 이벤트를 구독해서 배너를 노출.
 * 3) 사용자가 "새로고침" 을 누르면 대기 중인 SW 에 SKIP_WAITING 메시지를 보내고,
 *    SW 의 controllerchange 이벤트가 발사되면 main.tsx 가 location.reload() 수행.
 *
 * 데스크톱 Electron 환경에서는 별도의 DesktopUpdateBanner 가 있으므로 여기서는 표시하지 않는다.
 */

const DISMISS_KEY = "hinest.webUpdate.dismissUntil";

function isDismissed() {
  const v = localStorage.getItem(DISMISS_KEY);
  if (!v) return false;
  return Date.now() < Number(v);
}

function dismissFor(ms: number) {
  localStorage.setItem(DISMISS_KEY, String(Date.now() + ms));
}

/** 사용자가 지금 뭔가 작성 중인지 휴리스틱.
 *  - 입력창에 포커스가 있거나
 *  - 마지막 키 입력이 5초 이내거나
 *  → 자동 적용을 미루고 배너만 띄움(사용자가 직접 누르도록).
 *  내부 도구라 거의 항상 누군가 무언가 치고 있음 → 너무 길게 잡으면 영영 자동 적용 안 됨. */
const TYPING_QUIET_MS = 5_000;

function isTypingNow(lastKey: number): boolean {
  if (Date.now() - lastKey < TYPING_QUIET_MS) return true;
  const a = document.activeElement;
  if (!a) return false;
  const tag = a.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((a as HTMLElement).isContentEditable) return true;
  return false;
}

export default function UpdateBanner() {
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  const [applying, setApplying] = useState(false);
  const isDesktop = !!window.hinest?.isDesktop;

  useEffect(() => {
    if (isDesktop) return;

    let lastKey = 0;
    const onKey = () => { lastKey = Date.now(); };
    window.addEventListener("keydown", onKey, true);

    let pendingReg: ServiceWorkerRegistration | null = null;
    let autoTimer: number | null = null;

    /** 자동 적용 시도. 입력 중이면 다음 기회로 미루고 배너만 띄움. */
    function tryAutoApply() {
      if (!pendingReg) return;
      if (isTypingNow(lastKey)) {
        setReg(pendingReg); // 배너 표시 → 사용자 직접 클릭하면 적용
        return;
      }
      // 한가함 → 즉시 적용. SKIP_WAITING + controllerchange 가 main.tsx 에서 reload.
      const w = pendingReg.waiting;
      if (w) {
        w.postMessage("SKIP_WAITING");
        // 안전망 — controllerchange 이벤트가 안 오는 환경 대응.
        window.setTimeout(() => window.location.reload(), 1500);
      } else {
        window.location.reload();
      }
    }

    function onReady(e: Event) {
      const detail = (e as CustomEvent<{ reg?: ServiceWorkerRegistration }>).detail;
      const r = detail?.reg ?? null;
      if (!r) return;
      if (isDismissed()) return;
      pendingReg = r;
      // 배너를 일단 노출 + 6초 뒤 자동 적용 시도. 그 사이 사용자가 닫으면 취소.
      setReg(r);
      if (autoTimer) window.clearTimeout(autoTimer);
      autoTimer = window.setTimeout(tryAutoApply, 6_000);
    }

    window.addEventListener("hinest:update-ready", onReady as EventListener);
    return () => {
      window.removeEventListener("hinest:update-ready", onReady as EventListener);
      window.removeEventListener("keydown", onKey, true);
      if (autoTimer) window.clearTimeout(autoTimer);
    };
  }, [isDesktop]);

  if (isDesktop || !reg) return null;

  function onApply() {
    if (!reg) return;
    setApplying(true);
    // 대기 중인 SW 에 건너뛰라고 지시 → controllerchange 가 발사되면 main.tsx 가 새로고침.
    const waiting = reg.waiting;
    if (waiting) {
      waiting.postMessage("SKIP_WAITING");
      // 혹시 controllerchange 가 오지 않는 환경(특정 브라우저/SW 버그)을 위한 안전장치.
      // 이전 버전은 stale closure 로 applying 이 항상 false 캡처 → reload 가 실행되지 않았음.
      // 안전망은 조건 없이 무조건 1.5초 뒤 reload (그 사이 controllerchange 가 이미 reload 했으면 no-op).
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } else {
      window.location.reload();
    }
  }

  function onLater() {
    dismissFor(30 * 60 * 1000); // 30분
    setReg(null);
  }

  return (
    <div
      className="fixed bottom-5 right-5 z-[80] w-[340px] max-w-[calc(100vw-2.5rem)] panel p-0 overflow-hidden"
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
          <div className="text-[13px] font-extrabold">새 버전이 있어요</div>
          <div className="text-[11.5px] opacity-90 mt-0.5">
            새로고침하면 최신으로 업데이트돼요.
          </div>
        </div>
        <button
          onClick={onLater}
          className="text-white/80 hover:text-white"
          title="30분 뒤 다시 알림"
          aria-label="닫기"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="p-3 flex items-center justify-end gap-2">
        <button onClick={onLater} className="btn-ghost btn-xs">나중에</button>
        <button onClick={onApply} className="btn-primary btn-xs" disabled={applying}>
          {applying ? "적용 중…" : "새로고침"}
        </button>
      </div>
    </div>
  );
}
