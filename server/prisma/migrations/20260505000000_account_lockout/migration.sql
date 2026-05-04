-- 로그인 실패 카운터 + 계정 잠금 시각.
-- failedLoginCount 가 5 에 도달하면 lockedAt 설정 → 다음 로그인부터 401 ACCOUNT_LOCKED.
-- 관리자가 명시적으로 잠금 해제하기 전엔 풀리지 않음 (시간 기반 자동해제 X — 위 UX 안전).
ALTER TABLE "User"
  ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedAt" TIMESTAMP(3);
