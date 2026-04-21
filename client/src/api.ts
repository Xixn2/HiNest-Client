export async function api<T = any>(
  path: string,
  init: RequestInit & { json?: any } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as any),
  };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, {
    ...init,
    headers,
    body,
    credentials: "include",
  });
  if (!res.ok) {
    let msg = "요청 실패";
    let code: string | undefined;
    let data: any = undefined;
    try {
      data = await res.json();
      if (data?.error) msg = data.error;
      if (data?.code) code = data.code;
    } catch {}
    // 호출부에서 `e.status` / `e.code` / `e.data` 로 서버 신호를 확인할 수 있게 확장.
    // (예: 409 ALREADY_CHECKED_OUT → 재확인 모달 표시 후 force 재요청)
    const err = new Error(msg) as Error & { status?: number; code?: string; data?: any };
    err.status = res.status;
    err.code = code;
    err.data = data;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json();
  // GET 성공 응답은 캐시에 저장 — apiSWR 가 다음 방문 때 즉시 쓰도록.
  // 인증·개인 데이터가 섞여있어 sessionStorage (탭 단위, 로그아웃 시 닫히면 소멸) 사용.
  const method = (init.method ?? "GET").toUpperCase();
  if (method === "GET") writeCache(path, json);
  return json;
}

const CACHE_PREFIX = "hinest.swr:";

function cacheKey(path: string) {
  return `${CACHE_PREFIX}${path}`;
}

function writeCache(path: string, data: unknown) {
  try {
    sessionStorage.setItem(
      cacheKey(path),
      JSON.stringify({ t: Date.now(), data })
    );
  } catch {
    /* quota / disabled storage — 무시 */
  }
}

function readCache<T>(path: string, maxAgeMs = 10 * 60 * 1000): T | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { t: number; data: T };
    if (Date.now() - parsed.t > maxAgeMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Stale-while-revalidate 헬퍼.
 * 캐시된 값이 있으면 즉시 onCached 로 전달 → UI 가 바로 렌더.
 * 동시에 네트워크 요청을 쏴서 새 값이 오면 onFresh 로 재렌더.
 * 에러는 onError 로. 인증 만료 등 onError 가 처리해야 함.
 * Render Free 의 3~5초 콜드스타트를 최초 방문 이후 체감상 제거.
 *
 * 반환 Promise 는 "네트워크 완료" 시 resolve. await 해도 되지만 보통 fire-and-forget.
 */
export function apiSWR<T>(
  path: string,
  handlers: {
    onCached?: (data: T) => void;
    onFresh?: (data: T) => void;
    onError?: (err: Error) => void;
  }
): Promise<void> {
  const cached = readCache<T>(path);
  if (cached !== null && handlers.onCached) {
    // microtask 경계 — 호출부가 setState 등을 완료한 뒤 flush 되도록.
    queueMicrotask(() => handlers.onCached?.(cached));
  }
  return api<T>(path)
    .then((fresh) => handlers.onFresh?.(fresh))
    .catch((err: any) => handlers.onError?.(err instanceof Error ? err : new Error(String(err))));
}

/** 로그아웃 등에서 세션 캐시를 완전히 비울 때 사용. */
export function clearApiCache() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* noop */
  }
}

/**
 * 특정 경로의 캐시만 무효화 — POST/PATCH/DELETE 뒤에 GET 캐시를 버려서
 * 다음 방문 때 stale data 가 잠깐 보이는 flash 를 없앰.
 * pathPrefix 를 prefix 로 받으면 해당 prefix 로 시작하는 모든 경로를 비움
 * (예: "/api/meeting" → "/api/meeting", "/api/meeting?mine=1" 둘 다).
 */
export function invalidateCache(pathPrefix: string) {
  try {
    const prefix = cacheKey(pathPrefix);
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) sessionStorage.removeItem(k);
  } catch {
    /* noop */
  }
}
