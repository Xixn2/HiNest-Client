-- 폴더에도 문서와 동일한 공개 범위 필드를 추가.
-- 기본값 ALL 로 기존 행은 전체 공개로 유지.
ALTER TABLE "Folder"
  ADD COLUMN "scope"        TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN "scopeTeam"    TEXT,
  ADD COLUMN "scopeUserIds" TEXT,
  ADD COLUMN "authorId"     TEXT;
