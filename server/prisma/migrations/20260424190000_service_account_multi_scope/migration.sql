-- 서비스 계정 공유 범위 다중화.
-- 기존 단일 scopeTeam / projectId 는 그대로 두고, 여러 값을 담는 text[] 를 추가한다.
-- 가시성 쿼리에선 (scopeTeam = ? OR ? = ANY(scopeTeams)) 같은 형태로 둘 다 조사.
ALTER TABLE "ServiceAccount" ADD COLUMN "scopeTeams" TEXT[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE "ServiceAccount" ADD COLUMN "projectIds" TEXT[] NOT NULL DEFAULT '{}'::text[];

-- 기존 단일 값 백필 — 이미 저장된 공유 범위를 배열에도 반영.
UPDATE "ServiceAccount" SET "scopeTeams" = ARRAY["scopeTeam"]::text[] WHERE "scopeTeam" IS NOT NULL AND "scope" = 'TEAM';
UPDATE "ServiceAccount" SET "projectIds" = ARRAY["projectId"]::text[] WHERE "projectId" IS NOT NULL AND "scope" = 'PROJECT';
