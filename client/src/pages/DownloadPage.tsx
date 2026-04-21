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
function IconWindows() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5.2 10.4 4v7.3H3V5.2zM11.3 3.9 21 2.5v8.8h-9.7V3.9zM3 12.7h7.4V20L3 18.8v-6.1zM11.3 12.7H21v8.8l-9.7-1.4v-7.4z" />
    </svg>
  );
}
function IconApple() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16.5 12.5c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.6.9-.8 0-1.9-.9-3.2-.8C6.6 7.1 5 8 4.1 9.5c-1.9 3.3-.5 8.2 1.4 10.9.9 1.3 2 2.8 3.4 2.7 1.4-.1 1.9-.9 3.5-.9s2.1.9 3.5.9c1.5 0 2.4-1.3 3.3-2.7 1-1.5 1.5-3 1.5-3.1-.1 0-2.8-1.1-2.9-4.3zM14.1 4.7c.8-.9 1.3-2.2 1.1-3.5-1.1.1-2.3.7-3.1 1.6-.7.8-1.4 2.1-1.2 3.4 1.2.1 2.5-.6 3.2-1.5z" />
    </svg>
  );
}
function IconIOS() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.5 2A2.5 2.5 0 0 0 5 4.5v15A2.5 2.5 0 0 0 7.5 22h9a2.5 2.5 0 0 0 2.5-2.5v-15A2.5 2.5 0 0 0 16.5 2h-9zm0 2h9c.3 0 .5.2.5.5V18H7V4.5c0-.3.2-.5.5-.5zM12 19.2a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
    </svg>
  );
}
function IconAndroid() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.2 8.5c-.7 0-1.2.5-1.2 1.2v5.6c0 .7.5 1.2 1.2 1.2s1.2-.5 1.2-1.2V9.7c0-.7-.5-1.2-1.2-1.2zm9.6 0c-.7 0-1.2.5-1.2 1.2v5.6c0 .7.5 1.2 1.2 1.2s1.2-.5 1.2-1.2V9.7c0-.7-.5-1.2-1.2-1.2zM8.5 17.5c0 .6.4 1 1 1h.5V21c0 .7.5 1.2 1.2 1.2s1.2-.5 1.2-1.2v-2.5h1V21c0 .7.5 1.2 1.2 1.2s1.2-.5 1.2-1.2v-2.5h.5c.6 0 1-.4 1-1v-8h-9v8zM15.8 4.3l.9-1.6c.1-.1 0-.3-.1-.4-.1-.1-.3 0-.4.1l-.9 1.6C14.5 3.4 13.3 3 12 3s-2.5.4-3.3 1l-.9-1.6c-.1-.1-.3-.2-.4-.1-.1.1-.2.3-.1.4l.9 1.6C6.8 5.2 6 6.7 6 8.5h12c0-1.8-.8-3.3-2.2-4.2zM10 7a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1zm4 0a.5.5 0 1 1 0-1 .5.5 0 0 1 0 1z" />
    </svg>
  );
}

// ─── 카드 ────────────────────────────────────────────────────────────────
function Card({
  id,
  highlighted,
  icon,
  title,
  subtitle,
  children,
}: {
  id: OS;
  highlighted: boolean;
  icon: React.ReactNode;
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
        <div className="w-12 h-12 rounded-xl bg-ink-50 grid place-items-center text-ink-900">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[16px] font-bold text-ink-900 truncate">{title}</div>
          <div className="text-[12px] text-ink-500 truncate">{subtitle}</div>
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
      <div className="text-[13px] text-ink-700 leading-relaxed">{children}</div>
    </li>
  );
}

// ─── 본체 ────────────────────────────────────────────────────────────────
export default function DownloadPage() {
  const os = useMemo(() => detectOS(), []);
  const standalone = useMemo(() => isStandalonePWA(), []);

  return (
    <div className="min-h-screen bg-ink-50">
      {/* 상단 바 */}
      <header className="border-b border-ink-100 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[980px] mx-auto px-5 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <Logo size={20} />
          </Link>
          <Link to="/login" className="text-[12.5px] text-brand-600 font-semibold">
            로그인 →
          </Link>
        </div>
      </header>

      <main className="max-w-[980px] mx-auto px-5 py-8 sm:py-12">
        {/* 헤드라인 */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-[24px] sm:text-[32px] font-extrabold text-ink-900 tracking-tight">
            HiNest 다운로드
          </h1>
          <p className="mt-2 text-[13px] sm:text-[14px] text-ink-600">
            사용하시는 기기에 맞춰 설치하세요.
          </p>
        </div>

        {standalone && (
          <div className="mb-6 panel p-4 bg-emerald-50 border-emerald-200">
            <div className="text-[13px] font-bold text-emerald-900">
              이미 앱으로 실행 중이에요
            </div>
            <div className="text-[12px] text-emerald-700 mt-0.5">
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
              <p className="text-[11.5px] text-ink-500 leading-relaxed">
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
              <p className="text-[11.5px] text-ink-500 leading-relaxed">
                M1 / M2 / M3 맥은 Apple Silicon, 그 외 예전 맥은 Intel 을 받으세요.
              </p>
            </div>
          </Card>

          {/* iOS */}
          <Card
            id="ios"
            highlighted={os === "ios"}
            icon={<IconIOS />}
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
        <div className="mt-8 text-center text-[12px] text-ink-500">
          설치 중 문제가 생기면 관리자에게 문의해주세요.
        </div>
      </main>
    </div>
  );
}
