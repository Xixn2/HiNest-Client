/**
 * 아주 가벼운 서비스 워커.
 * 목적:
 *  1) Android Chrome PWA 설치 조건을 충족 (fetch handler 존재 필요)
 *  2) 네트워크 우선 전략 — 항상 최신 앱을 받도록 (캐시 고착 방지)
 *  3) 새 버전 배포 시 skipWaiting + clients.claim 으로 즉시 활성화
 *
 * 중요: 지금은 오프라인 캐시를 하지 않는다. 사내 SaaS 는 로그인 + API 필수라
 * 오프라인을 어설프게 지원하는 것보다 "최신 버전만 확실히 보장" 이 낫다.
 * 추후 오프라인 지원이 필요해지면 여기서부터 확장.
 */

const VERSION = "v1";

self.addEventListener("install", (event) => {
  // 새 SW 를 곧바로 활성화 (대기 단계 생략)
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 옛 버전 캐시가 남아있다면 정리
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  // 네트워크 우선 — 항상 서버에 먼저 물어봄. 페이지 캐시로 오래된 코드가 박히는 걸 방지.
  // 실패했을 때만 캐시가 있으면 반환 (현재 캐시는 비어있으므로 사실상 no-op).
  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch (err) {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});

// 렌더러가 "새 버전 강제 활성화" 를 요청할 때
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
