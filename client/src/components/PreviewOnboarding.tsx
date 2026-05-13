import { useEffect, useState } from "react";
import { isPreviewMode } from "../lib/previewMock";

/**
 * 미리보기 진입 직후 한 번만 노출되는 온보딩 오버레이.
 *  - 4단계 카드형 모달 (건너뛰기 가능, 진행률 점, 이전/다음)
 *  - sessionStorage 로 dismiss 기억 → 같은 탭 안에서 재안내 X
 *  - 미리보기 모드가 아니면 절대 렌더 안 함
 */

const KEY = "hinest:preview-onboarded";

type Step = {
  emoji: string;
  title: string;
  body: string;
  bullets?: string[];
};

const STEPS: Step[] = [
  {
    emoji: "👋",
    title: "HiNest 미리보기에 오신 걸 환영해요",
    body: "사내 협업에 필요한 모든 흐름을 한 화면에서 둘러보실 수 있어요. 데이터는 모두 데모이고, 변경 사항은 저장되지 않습니다.",
  },
  {
    emoji: "🧭",
    title: "왼쪽 사이드바로 페이지 이동",
    body: "워크스페이스에는 일정 · 회의록 · 결재 · 근태 · 문서 등 자주 쓰는 메뉴가 모여있어요. 대기 항목이 있으면 옆에 빨간 카운트로 표시됩니다.",
    bullets: [
      "개요 — 출근/오늘 일정/공지 한눈에",
      "회의록 — 노션 스타일 리치 에디터",
      "전자결재 — 출장 · 외근 · 지출 · 구매",
    ],
  },
  {
    emoji: "💬",
    title: "우측 하단 채팅으로 팀과 소통",
    body: "1:1 DM 부터 팀방, 전사 공지방까지 사내톡으로 처리해요. 이모지 반응 · 코드 블록 · 이미지 공유 모두 지원합니다.",
  },
  {
    emoji: "🛡️",
    title: "개발자 페이지로 운영도 한 곳에서",
    body: "활동 로그 / 세션 관리 / 에러 대시보드 / 헬스체크 / Feature Flag 등 11개 운영 도구가 통합돼 있어요. ADMIN 권한이라 사이드바 \"관리\" 카테고리에서 진입 가능.",
  },
];

export default function PreviewOnboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // 미리보기 진입 + 아직 dismiss 안 한 사용자에게만 노출.
    if (!isPreviewMode()) return;
    let done = false;
    try { done = sessionStorage.getItem(KEY) === "1"; } catch {}
    if (done) return;
    // 짧은 지연 — 대시보드가 1프레임 렌더된 뒤에 부드럽게 띄움.
    const t = setTimeout(() => setOpen(true), 400);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    try { sessionStorage.setItem(KEY, "1"); } catch {}
    setOpen(false);
  }

  if (!open) return null;
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div
      className="fixed inset-0 hinest-onb-overlay"
      style={{ zIndex: 10000 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-onboarding-title"
    >
      {/* 건너뛰기 — 우측 상단 플로팅 */}
      <button
        type="button"
        onClick={dismiss}
        className="hinest-onb-skip absolute top-5 right-5 text-[12px] font-bold transition"
        style={{
          color: "rgba(255,255,255,0.78)",
          padding: "8px 14px",
          borderRadius: 999,
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.16)",
        }}
      >
        건너뛰기
      </button>

      {/* 콘텐츠 — 가운데 정렬, 틀 없음 */}
      <div className="absolute inset-0 flex items-center justify-center px-6">
        <div
          key={step /* 단계 전환 시 re-mount 애니메이션 */}
          className="w-full max-w-[520px] hinest-onb-card text-center"
        >
          <div className="text-[64px] mb-5 leading-none hinest-onb-emoji">{s.emoji}</div>
          <h2
            id="preview-onboarding-title"
            className="text-[28px] sm:text-[32px] font-extrabold tracking-tight leading-tight"
            style={{ color: "#fff", textShadow: "0 2px 24px rgba(0,0,0,0.4)" }}
          >
            {s.title}
          </h2>
          <p
            className="mt-4 text-[15px] sm:text-[16px] leading-relaxed mx-auto max-w-[480px]"
            style={{ color: "rgba(255,255,255,0.82)", textShadow: "0 1px 12px rgba(0,0,0,0.35)" }}
          >
            {s.body}
          </p>
          {s.bullets && (
            <ul className="mt-5 inline-flex flex-col items-start gap-2 text-left mx-auto">
              {s.bullets.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-[14px]"
                  style={{ color: "rgba(255,255,255,0.88)", textShadow: "0 1px 10px rgba(0,0,0,0.35)" }}
                >
                  <span
                    className="mt-2 inline-block rounded-full flex-shrink-0"
                    style={{ width: 5, height: 5, background: "var(--c-brand)", boxShadow: "0 0 12px var(--c-brand)" }}
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 하단 — 진행률 + 액션 (플로팅) */}
      <div className="absolute left-0 right-0 bottom-8 sm:bottom-12 flex flex-col items-center gap-5 px-6">
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === step ? 22 : 6,
                height: 6,
                background: i === step ? "#fff" : "rgba(255,255,255,0.32)",
                boxShadow: i === step ? "0 0 12px rgba(255,255,255,0.5)" : "none",
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          {!isFirst && (
            <button
              type="button"
              onClick={() => setStep((n) => Math.max(0, n - 1))}
              className="px-5 py-2.5 rounded-full text-[13px] font-bold transition"
              style={{
                color: "rgba(255,255,255,0.85)",
                background: "rgba(255,255,255,0.08)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.16)",
              }}
            >
              이전
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              className="px-7 py-2.5 rounded-full text-[13.5px] font-extrabold transition"
              style={{
                background: "#fff",
                color: "var(--c-brand)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              }}
              onClick={() => setStep((n) => Math.min(STEPS.length - 1, n + 1))}
            >
              다음
            </button>
          ) : (
            <button
              type="button"
              className="px-7 py-2.5 rounded-full text-[13.5px] font-extrabold transition"
              style={{
                background: "#fff",
                color: "var(--c-brand)",
                boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              }}
              onClick={dismiss}
            >
              시작하기
            </button>
          )}
        </div>
      </div>

      {/* 진입 애니메이션 — 배경은 블러+딤이 부드럽게 깔리고, 콘텐츠는 떠오르듯 */}
      <style>{`
        .hinest-onb-overlay {
          background: rgba(8, 12, 24, 0);
          backdrop-filter: blur(0px);
          -webkit-backdrop-filter: blur(0px);
          animation: hinest-onb-overlay-in 0.42s ease-out forwards;
        }
        @keyframes hinest-onb-overlay-in {
          to {
            background: rgba(8, 12, 24, 0.62);
            backdrop-filter: blur(18px) saturate(140%);
            -webkit-backdrop-filter: blur(18px) saturate(140%);
          }
        }
        .hinest-onb-card {
          animation: hinest-onb-card-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both;
          animation-delay: 0.08s;
          will-change: transform, opacity, filter;
        }
        @keyframes hinest-onb-card-in {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.97);
            filter: blur(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }
        .hinest-onb-emoji {
          animation: hinest-onb-emoji-in 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
          animation-delay: 0.18s;
        }
        @keyframes hinest-onb-emoji-in {
          from { opacity: 0; transform: scale(0.5) rotate(-8deg); }
          to   { opacity: 1; transform: scale(1) rotate(0); }
        }
        .hinest-onb-skip {
          animation: hinest-onb-fade-in 0.4s ease-out both;
          animation-delay: 0.4s;
        }
        .hinest-onb-skip:hover {
          background: rgba(255,255,255,0.14) !important;
          color: #fff !important;
        }
        @keyframes hinest-onb-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hinest-onb-overlay,
          .hinest-onb-card,
          .hinest-onb-emoji,
          .hinest-onb-skip {
            animation-duration: 0.01ms !important;
            animation-delay: 0 !important;
            animation-iteration-count: 1 !important;
          }
          .hinest-onb-overlay {
            background: rgba(8, 12, 24, 0.62);
            backdrop-filter: blur(18px) saturate(140%);
            -webkit-backdrop-filter: blur(18px) saturate(140%);
          }
        }
      `}</style>
    </div>
  );
}
