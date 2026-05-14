import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

/**
 * 메일 발송 헬퍼 — AWS SES 사용.
 *
 * 환경 변수:
 *   SES_FROM_ADDRESS   필수 — 발신 주소 (verified identity). 예: "HiNest <no-reply@nest.hi-vits.com>"
 *   AWS_REGION         기본 ap-northeast-2
 *   AWS_ACCESS_KEY_ID  / AWS_SECRET_ACCESS_KEY 또는 ECS Task Role
 *
 * 운영 사전 조건:
 *   1) SES 콘솔에서 발신 도메인(또는 단일 이메일) 을 verify
 *   2) Production access 받기 (샌드박스 상태에선 verified recipient 에게만 보낼 수 있음)
 *   3) Task Role 에 ses:SendEmail / ses:SendRawEmail 권한 부여
 *
 * Fallback 동작:
 *   SES_FROM_ADDRESS 가 없거나 SES 호출이 실패하면 서버 콘솔에 메일 본문을 그대로 찍는다.
 *   초기 셋업/오프라인 디버깅용 — 운영 환경에선 절대 의도된 경로가 아님 (반드시 SES 설정 필요).
 */

const FROM = process.env.SES_FROM_ADDRESS;
const REGION = process.env.AWS_REGION || "ap-northeast-2";

let _ses: SESClient | null = null;
function ses() {
  if (_ses) return _ses;
  _ses = new SESClient({ region: REGION });
  return _ses;
}

export type EmailPayload = {
  to: string;
  subject: string;
  /** 일반 텍스트 본문 — 클라이언트가 HTML 을 못 렌더할 때 fallback. */
  text: string;
  /** HTML 본문 — 가능하면 동봉. 없으면 text 만 보냄. */
  html?: string;
};

export async function sendEmail(payload: EmailPayload): Promise<{ ok: boolean; messageId?: string; reason?: string }> {
  if (!FROM) {
    logFallback(payload, "SES_FROM_ADDRESS 미설정");
    return { ok: false, reason: "SES_FROM_ADDRESS not configured" };
  }
  try {
    const cmd = new SendEmailCommand({
      Source: FROM,
      Destination: { ToAddresses: [payload.to] },
      Message: {
        Subject: { Data: payload.subject, Charset: "UTF-8" },
        Body: {
          Text: { Data: payload.text, Charset: "UTF-8" },
          ...(payload.html ? { Html: { Data: payload.html, Charset: "UTF-8" } } : {}),
        },
      },
    });
    const r = await ses().send(cmd);
    return { ok: true, messageId: r.MessageId };
  } catch (e: any) {
    // SES 호출 실패해도 throw 하지 않음 — 호출 측이 사용자에게 동일한 응답을 줘서
    // "이 이메일이 가입되어 있는가" 를 노출하지 않게 하려는 것. 대신 콘솔에 강하게 남김.
    logFallback(payload, `SES error: ${e?.message ?? String(e)}`);
    return { ok: false, reason: e?.message ?? String(e) };
  }
}

function logFallback(p: EmailPayload, reason: string) {
  // 운영자가 CloudWatch 에서 검색하기 좋은 마커.
  console.error("=".repeat(60));
  console.error("[EMAIL_FALLBACK] 메일 발송 실패 — 콘솔에 내용 출력");
  console.error(`reason : ${reason}`);
  console.error(`to     : ${p.to}`);
  console.error(`subject: ${p.subject}`);
  console.error("--- text ---");
  console.error(p.text);
  console.error("=".repeat(60));
}
