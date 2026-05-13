-- 일회성 운영 마이그레이션 — 모든 잠긴 계정의 잠금을 푼다.
--
-- 배경:
--   이 시점에 운영자(본인 포함) 다수가 비밀번호 5회 오답으로 잠겨있는 상태.
--   ECS Exec 권한이 IAM role 에 없어 컨테이너 내부에서 Prisma 를 직접 실행할 수 없고,
--   잠긴 상태에선 어드민 페이지의 unlock 버튼도 못 누른다.
--   부팅 시 자동 실행되는 `prisma migrate deploy` 를 이용해서 SQL UPDATE 한 방으로 풀어버린다.
--
-- 멱등성:
--   migrate deploy 는 _prisma_migrations 테이블로 어떤 마이그레이션이 이미 적용됐는지
--   추적하므로 이 SQL 은 단 한 번만 실행된다. 이후에 또 잠긴 계정이 생기면
--   어드민 페이지의 "잠긴 계정 일괄 해제" 버튼이나 단일 unlock 엔드포인트를 쓰면 된다.
UPDATE "User"
SET "lockedAt" = NULL,
    "failedLoginCount" = 0
WHERE "lockedAt" IS NOT NULL
   OR "failedLoginCount" > 0;
