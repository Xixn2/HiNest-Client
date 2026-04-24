import { alertAsync } from "../components/ConfirmHost";

/**
 * 텍스트를 클립보드에 복사 + 토스트/알림 피드백.
 *
 * navigator.clipboard 는 다음 경우에 실패할 수 있어서 textarea fallback 을 둔다:
 * - 비-HTTPS 환경(사내 테스트 서버 등)
 * - 사용자 제스처 컨텍스트가 끊긴 상태 (예: 비동기 await 체인 뒤에서 호출)
 * - 일부 구형 브라우저 / WebView
 *
 * @param text 복사할 문자열
 * @param opts.title / description 성공 알림 문구. description 을 빈 문자열로 주면 알림 생략.
 */
export async function copyToClipboard(
  text: string,
  opts: { title?: string; description?: string } = {},
) {
  const title = opts.title ?? "복사됨";
  const description = opts.description ?? "클립보드에 복사했어요.";

  let ok = false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      ok = true;
    }
  } catch {
    // fallthrough to fallback
  }
  if (!ok) {
    // execCommand 기반 폴백 — 화면에 안 보이는 textarea 로 복사.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "0";
      ta.style.left = "0";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {
      ok = false;
    }
  }

  if (ok && description) {
    alertAsync({ title, description });
  } else if (!ok) {
    alertAsync({
      title: "복사 실패",
      description: "브라우저가 복사를 막았어요. 주소를 직접 선택해 복사해 주세요.",
    });
  }
  return ok;
}

/**
 * 현재 origin 기준의 절대 URL 을 만들어 반환. 사내톡에 붙여넣어도 서버/클라 호스트가
 * 동일하면 그대로 딥링크로 동작.
 */
export function absoluteUrl(pathOrQuery: string): string {
  if (typeof window === "undefined") return pathOrQuery;
  try {
    return new URL(pathOrQuery, window.location.origin).toString();
  } catch {
    return pathOrQuery;
  }
}
