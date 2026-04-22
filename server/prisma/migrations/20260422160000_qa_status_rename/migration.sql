-- QA 상태 라벨을 제품 맥락에 맞춰 재정의.
--   OPEN    → BUG         (오류)
--   FAILED  → IN_PROGRESS (수정 중)
--   PASSED  → DONE        (완료)
--   SKIPPED → ON_HOLD     (보류)
-- status 는 TEXT 컬럼이라 enum 제약이 없어 UPDATE + DEFAULT 갱신으로 충분.
UPDATE "ProjectQaItem" SET "status" = 'BUG'         WHERE "status" = 'OPEN';
UPDATE "ProjectQaItem" SET "status" = 'IN_PROGRESS' WHERE "status" = 'FAILED';
UPDATE "ProjectQaItem" SET "status" = 'DONE'        WHERE "status" = 'PASSED';
UPDATE "ProjectQaItem" SET "status" = 'ON_HOLD'     WHERE "status" = 'SKIPPED';

ALTER TABLE "ProjectQaItem" ALTER COLUMN "status" SET DEFAULT 'BUG';
