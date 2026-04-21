import { useMemo } from "react";
import { Link } from "react-router-dom";
import Logo from "../components/Logo";

/**
 * 다운로드 페이지 (/download).
 *
 * - Windows / macOS → 데스크톱 인스톨러 다운로드 링크
 * - iOS / Android   → PWA "홈 화면에 추가" 안내 (네이티브 앱 없이 웹앱으로 처리)
 *
 * 공개 페이지 — 로그인 없이 접근 가능. 사내 누구나 공유받고 바로 설치 흐름으로 갈 수 있도록.
 *
 * 설치 파일 호스팅:
 *   현재는 GitHub Releases 에 올릴 예정이며, 아래 링크는 임시 플레이스홀더.
 *   실제 릴리스 레포가 확정되면 `DESKTOP_RELEASES_BASE` 만 바꾸면 된다.
 *
 * 다크 모드: html.dark 클래스 + CSS 변수(--c-bg / --c-surface / --c-text ...)로 자동 전환.
 *   → 배경/상단바에 var(--c-bg) 사용. 텍스트는 --c-text / --c-text-2 / --c-text-3.
 */

const DESKTOP_RELEASES_BASE =
  "https://github.com/hi-vits/hinest-desktop/releases/latest/download";

type OS = "win" | "mac" | "ios" | "android" | "other";

function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || "";
  // iPadOS 13+ 는 Mac 으로 보고됨 → touch 로 구분
  const isIPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
  if (/iPhone|iPod/.test(ua) || isIPad) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) return "mac";
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return "win";
  return "other";
}

function isStandalonePWA() {
  if (typeof window === "undefined") return false;
  // iOS Safari: navigator.standalone. 기타: display-mode: standalone
  return (
    (navigator as any).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches
  );
}

// ─── 아이콘 ──────────────────────────────────────────────────────────────
// 각 플랫폼의 공식 심볼로 통일 — currentColor 로 그려서 다크/라이트 자동 대응.

function IconWindows() {
  // Windows 11 4-quadrant 로고 (작은 gap)
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="2" y="2" width="9" height="9" rx="0.6" />
      <rect x="13" y="2" width="9" height="9" rx="0.6" />
      <rect x="2" y="13" width="9" height="9" rx="0.6" />
      <rect x="13" y="13" width="9" height="9" rx="0.6" />
    </svg>
  );
}

function IconApple() {
  // macOS 공식 Apple 로고 (잎 달린 한 입 베어문 사과)
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.543 12.584c-.02-2.19 1.789-3.246 1.87-3.296-1.019-1.488-2.605-1.691-3.17-1.716-1.349-.137-2.633.793-3.32.793-.685 0-1.744-.772-2.868-.752-1.476.021-2.838.858-3.598 2.177-1.532 2.652-.39 6.58 1.103 8.74.728 1.057 1.597 2.247 2.735 2.205 1.098-.044 1.513-.71 2.842-.71 1.33 0 1.703.71 2.868.687 1.184-.02 1.934-1.079 2.66-2.14.837-1.229 1.182-2.418 1.203-2.48-.027-.011-2.304-.883-2.325-3.508zm-2.191-6.445c.607-.735 1.016-1.755.904-2.77-.873.035-1.933.582-2.561 1.316-.562.648-1.055 1.685-.923 2.682.975.075 1.972-.495 2.58-1.228z" />
    </svg>
  );
}

function IconIPhone() {
  // iPhone 실루엣 — macOS 카드(사과)와 구분되도록 기기 아이콘으로.
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="6" y="2" width="12" height="20" rx="2.6" />
      <path d="M10 5.4h4" strokeLinecap="round" />
      <circle cx="12" cy="19.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconAndroid() {
  // Android 로봇 마스코트 (머리 실루엣 + 안테나 2개 + 눈 2개)
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6.5 10h11a.5.5 0 0 1 .5.5V17a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-6.5a.5.5 0 0 1 .5-.5z" />
      <rect x="3" y="10.2" width="2.2" height="6.6" rx="1.1" />
      <rect x="18.8" y="10.2" width="2.2" height="6.6" rx="1.1" />
      <rect x="9" y="18" width="2.2" height="4.6" rx="1.1" />
      <rect x="12.8" y="18" width="2.2" height="4.6" rx="1.1" />
      <path
        d="M7.2 9.2c.3-2 1.7-3.6 3.7-4.4l-.9-1.6a.3.3 0 0 1 .5-.3l1 1.7c.5-.2 1-.2 1.5-.2s1 0 1.5.2l1-1.7a.3.3 0 0 1 .5.3l-.9 1.6c2 .8 3.4 2.4 3.7 4.4H7.2z"
      />
      <circle cx="9.6" cy="7.3" r="0.7" style={{ fill: "var(--c-surface-3)" }} />
      <circle cx="14.4" cy="7.3" r="0.7" style={{ fill: "var(--c-surface-3)" }} />
    </svg>
  );
}

// ─── 카드 ────────────────────────────────────────────────────────────────
function Card({
  id,
  highlighted,
  icon,
  iconColor,
  title,
  subtitle,
  children,
}: {
  id: OS;
  highlighted: boolean;
  icon: React.ReactNode;
  iconColor?: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`panel p-5 sm:p-6 relative ${
        highlighted ? "ring-2 ring-brand-500 shadow-lg" : ""
      }`}
      id={`dl-${id}`}
    >
      {highlighted && (
        <div className="absolute -top-2.5 right-4 text-[10.5px] font-extrabold px-2 py-0.5 rounded-full bg-brand-500 text-white">
          내 기기
        </div>
      )}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-12 h-12 rounded-xl grid place-items-center flex-shrink-0"
          style={{
            background: "var(--c-surface-3)",
            color: iconColor ?? "var(--c-text)",
          }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div
            className="text-[16px] font-bold truncate"
            style={{ color: "var(--c-text)" }}
          >
            {title}
          </div>
          <div
            className="text-[12px] truncate"
            style={{ color: "var(--c-text-3)" }}
          >
            {subtitle}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 items-start">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-500 text-white text-[11px] font-bold grid place-items-center mt-0.5">
        {n}
      </span>
      <div
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--c-text-2)" }}
      >
        {children}
      </div>
    </li>
  );
}

// ─── 본체 ────────────────────────────────────────────────────────────────
export default function DownloadPage() {
  const os = useMemo(() => detectOS(), []);
  const standalone = useMemo(() => isStandalonePWA(), []);

  return (
    <div className="min-h-screen" style={{ background: "var(--c-bg)" }}>
      {/* 상단 바 — 배경/테두리를 테마 변수로 처리해서 다크모드에서도 자연스럽게 */}
      <header
        className="sticky top-0 z-10 backdrop-blur"
        style={{
          background: "color-mix(in srgb, var(--c-bg) 82%, transparent)",
          borderBottom: "1px solid var(--c-border)",
        }}
      >
        <div className="max-w-[980px] mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <Logo size={20} />
          </Link>
          <Link
            to="/login"
            className="text-[12.5px] font-semibold"
            style={{ color: "var(--c-brand)" }}
          >
            로그인 →
          </Link>
        </div>
      </header>

      <main className="max-w-[980px] mx-auto px-5 py-8 sm:py-12">
        {/* 헤드라인 */}
        <div className="text-center mb-8 sm:mb-12">
          <h1
            className="text-[24px] sm:text-[32px] font-extrabold tracking-tight"
            style={{ color: "var(--c-text)" }}
          >
            HiNest 다운로드
          </h1>
          <p
            className="mt-2 text-[13px] sm:text-[14px]"
            style={{ color: "var(--c-text-3)" }}
          >
            사용하시는 기기에 맞춰 설치하세요.
          </p>
        </div>

        {standalone && (
          <div
            className="mb-6 panel p-4"
            style={{
              background: "color-mix(in srgb, var(--c-success) 12%, var(--c-surface))",
              borderColor: "color-mix(in srgb, var(--c-success) 35%, var(--c-border))",
            }}
          >
            <div
              className="text-[13px] font-bold"
              style={{ color: "var(--c-success)" }}
            >
              이미 앱으로 실행 중이에요
            </div>
            <div
              className="text-[12px] mt-0.5"
              style={{ color: "var(--c-text-2)" }}
            >
              홈 화면에서 HiNest 를 바로 열 수 있어요.
            </div>
          </div>
        )}

        {/* 플랫폼 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          {/* Windows */}
          <Card
            id="win"
            highlighted={os === "win"}
            icon={<IconWindows />}
            iconColor="#00A4EF"
            title="Windows"
            subtitle="Windows 10 이상 · 64-bit"
          >
            <div className="space-y-2">
              <a
                href={`${DESKTOP_RELEASES_BASE}/HiNest-Setup.exe`}
                className="btn-primary w-full"
              >
                설치 파일 다운로드
              </a>
              <p
                className="text-[11.5px] leading-relaxed"
                style={{ color: "var(--c-text-3)" }}
              >
                다운로드 후 설치 파일을 실행하세요. 첫 실행 시 SmartScreen 경고가 뜨면
                "추가 정보 → 실행"을 눌러주세요.
              </p>
            </div>
          </Card>

          {/* macOS */}
          <Card
            id="mac"
            highlighted={os === "mac"}
            icon={<IconApple />}
            title="macOS"
            subtitle="macOS 12 Monterey 이상"
          >
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={`${DESKTOP_RELEASES_BASE}/HiNest-arm64.dmg`}
                  className="btn-primary"
                >
                  Apple Silicon
                </a>
                <a
                  href={`${DESKTOP_RELEASES_BASE}/HiNest-x64.dmg`}
                  className="btn-ghost"
                >
                  Intel
                </a>
              </div>
              <p
                className="text-[11.5px] leading-relaxed"
                style={{ color: "var(--c-text-3)" }}
              >
                M1 / M2 / M3 맥은 Apple Silicon, 그 외 예전 맥은 Intel 을 받으세요.
              </p>
            </div>
          </Card>

          {/* iOS */}
          <Card
            id="ios"
            highlighted={os === "ios"}
            icon={<IconIPhone />}
            title="iPhone · iPad"
            subtitle="Safari 에서 홈 화면에 추가"
          >
            <ol className="space-y-2.5">
              <Step n={1}>Safari 로 이 페이지에 접속하세요.</Step>
              <Step n={2}>
                하단 가운데 <b>공유</b>{" "}
                <span className="inline-block align-middle">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                </span>{" "}
                버튼을 눌러주세요.
              </Step>
              <Step n={3}>
                메뉴에서 <b>홈 화면에 추가</b> 를 선택하세요.
              </Step>
              <Step n={4}>홈 화면의 HiNest 아이콘으로 앱처럼 바로 실행할 수 있어요.</Step>
            </ol>
          </Card>

          {/* Android */}
          <Card
            id="android"
            highlighted={os === "android"}
            icon={<IconAndroid />}
            iconColor="#3DDC84"
            title="Android"
            subtitle="Chrome 에서 앱 설치"
          >
            <ol className="space-y-2.5">
              <Step n={1}>Chrome 으로 이 페이지에 접속하세요.</Step>
              <Step n={2}>
                주소창 오른쪽 <b>⋮</b> 메뉴를 누르세요.
              </Step>
              <Step n={3}>
                <b>앱 설치</b> 또는 <b>홈 화면에 추가</b> 를 선택하세요.
              </Step>
              <Step n={4}>홈 화면에 추가된 HiNest 아이콘으로 바로 실행할 수 있어요.</Step>
            </ol>
          </Card>
        </div>

        {/* 도움말 */}
        <div
          className="mt-8 text-center text-[12px]"
          style={{ color: "var(--c-text-3)" }}
        >
          설치 중 문제가 생기면 관리자에게 문의해주세요.
        </div>
      </main>
    </div>
  );
}
