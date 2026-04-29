import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { FeatureFlagsProvider } from "./lib/featureFlags";
import { ThemeProvider } from "./theme";
import "./styles.css";

// iOS Safari 는 user-scalable=no 를 무시하므로 제스처/더블탭 확대를 JS 로 차단.
if (typeof window !== "undefined") {
  // 핀치 줌 (iOS)
  document.addEventListener("gesturestart", (e) => e.preventDefault());
  document.addEventListener("gesturechange", (e) => e.preventDefault());
  document.addEventListener("gestureend", (e) => e.preventDefault());
  // 더블탭 줌
  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 350) e.preventDefault();
      lastTouchEnd = now;
    },
    { passive: false }
  );
  // 두 손가락 터치 줌 방지
  document.addEventListener(
    "touchmove",
    (e) => {
      if ((e as TouchEvent).touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );

  // ─────────────────────────────────────────────────────────────
  // PWA 서비스 워커 등록 + 새 버전 감지 → "새 버전이 있어요" 배너
  // ─────────────────────────────────────────────────────────────
  // - 기본 동작: 사용자가 앱을 연 채로 새 배포가 나오면, navigator.serviceWorker
  //   가 새 SW 를 fetch 하고 updatefound 이벤트로 알림.
  // - 배너는 AppLayout 쪽에서 "hinest:update-ready" 커스텀 이벤트를 수신해서 표시.
  //   여기선 등록과 이벤트 전파만 담당.
  // - localhost 에선 등록 안 함 (dev 에서 캐시 꼬이는 거 방지).
  if ("serviceWorker" in navigator && !/localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          // 페이지 로드 시점에 이미 대기 중인 SW 가 있으면 즉시 알림
          if (reg.waiting) {
            window.dispatchEvent(new CustomEvent("hinest:update-ready", { detail: { reg } }));
          }
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              if (nw.state === "installed" && navigator.serviceWorker.controller) {
                // 이미 활성 SW 가 있고 + 새 SW 가 설치 완료 → 업데이트 대기 중
                window.dispatchEvent(new CustomEvent("hinest:update-ready", { detail: { reg } }));
              }
            });
          });
          // 30분마다 업데이트 체크 (앱을 켜놓고 방치하는 경우 대비)
          setInterval(() => { reg.update().catch(() => {}); }, 30 * 60 * 1000);
          // 탭이 포그라운드로 돌아올 때 즉시 한번 확인 — 다른 일 보고 돌아왔을 때
          // 30분을 기다리지 않고 바로 새 버전을 끌어오게.
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
              reg.update().catch(() => {});
            }
          });
        })
        .catch(() => { /* 서비스 워커 등록 실패는 무시 */ });

      // 새 SW 가 활성화되면 한번 자동 새로고침 (사용자가 배너의 "새로고침" 을 눌렀을 때)
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    });
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <FeatureFlagsProvider>
            <App />
          </FeatureFlagsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
);
