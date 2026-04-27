-- "HiNest 개발자" 딱지 — UI 칩 노출 + "개발 중" 페이지 접근 권한.
ALTER TABLE "User" ADD COLUMN "isDeveloper" BOOLEAN NOT NULL DEFAULT false;
-- 서지완 계정에 자동 부여 (최초 부트스트랩).
UPDATE "User" SET "isDeveloper" = true WHERE name = '서지완';
