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
      className="fixed inset-0 grid place-items-center p-4 hinest-onb-overlay"
      style={{ zIndex: 10000 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-onboarding-title"
    >
      <div
        key={step /* 단계 전환 시 살짝 re-mount 애니메이션 */}
        className="w-full max-w-[460px] rounded-2xl overflow-hidden hinest-onb-card"
        style={{
          background: "var(--c-surface)",
          boxShadow: "0 24px 60px rgba(2,6,23,0.35), 0 1px 0 rgba(255,255,255,0.05) inset",
          border: "1px solid var(--c-border)",
        }}
      >
        {/* 상단 그라데이션 헤더 */}
        <div
          className="relative px-6 py-7"
          style={{ background: "linear-gradient(135deg, var(--c-brand) 0%, #7C3AED 100%)", color: "#fff" }}
        >
          {/* 건너뛰기 */}
          <button
            type="button"
            onClick={dismiss}
            className="absolute top-3 right-3 text-[11.5px] font-bold opacity-85 hover:opacity-100 transition"
            style={{ background: "rgba(255,255,255,0.16)", padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.24)" }}
          >
            건너뛰기
          </button>
          <div className="text-[36px] mb-2">{s.emoji}</div>
          <h2 id="preview-onboarding-title" className="text-[19px] font-extrabold tracking-tight">{s.title}</h2>
        </div>

        {/* 본문 */}
        <div className="px-6 py-5">
          <p className="text-[13.5px] text-ink-700 leading-relaxed">{s.body}</p>
          {s.bullets && (
            <ul className="mt-3 space-y-1.5">
              {s.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink-700">
                  <span className="text-brand-600 mt-0.5">•</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 하단 — 진행률 + 액션 */}
        <div className="px-6 pb-5 pt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className="rounded-full transition"
                style={{
                  width: i === step ? 18 : 6,
                  height: 6,
                  background: i === step ? "var(--c-brand)" : "var(--c-surface-3)",
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button type="button" className="btn-ghost btn-xs" onClick={() => setStep((n) => Math.max(0, n - 1))}>
                이전
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-[12.5px] font-extrabold transition"
                style={{ background: "var(--c-brand)", color: "#fff" }}
                onClick={() => setStep((n) => Math.min(STEPS.length - 1, n + 1))}
              >
                다음
              </button>
            ) : (
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-[12.5px] font-extrabold transition"
                style={{ background: "var(--c-brand)", color: "#fff" }}
                onClick={dismiss}
              >
                시작하기
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 진입 애니메이션 — 배경은 블러+딤이 부드럽게 깔리고, 카드는 살짝 위에서 떠오름 */}
      <style>{`
        .hinest-onb-overlay {
          background: rgba(15, 23, 42, 0);
          backdrop-filter: blur(0px);
          -webkit-backdrop-filter: blur(0px);
          animation: hinest-onb-overlay-in 0.32s ease-out forwards;
        }
        @keyframes hinest-onb-overlay-in {
          to {
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }
        }
        .hinest-onb-card {
          animation: hinest-onb-card-in 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
          transform-origin: center;
          will-change: transform, opacity;
        }
        @keyframes hinest-onb-card-in {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .hinest-onb-overlay,
          .hinest-onb-card {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
          .hinest-onb-overlay {
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }
        }
      `}</style>
    </div>
  );
}
