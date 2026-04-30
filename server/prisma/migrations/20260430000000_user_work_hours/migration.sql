-- 사용자별 기준 근무 시각 — 개요 페이지의 진행률 바, 추후 야근 산정 등에 사용.
-- NULL 인 사용자는 기본값 09:00 / 18:00 으로 간주.
ALTER TABLE "User"
  ADD COLUMN "workStartTime" TEXT,
  ADD COLUMN "workEndTime"   TEXT;
