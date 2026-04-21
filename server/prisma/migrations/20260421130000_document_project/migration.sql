-- 프로젝트 문서함 지원: Folder/Document 에 projectId 추가.
-- projectId 가 있으면 가시성은 ProjectMember 기준으로 판단 (scope 무시).
ALTER TABLE "Folder"   ADD COLUMN "projectId" TEXT;
ALTER TABLE "Document" ADD COLUMN "projectId" TEXT;

-- 프로젝트 삭제 시 관련 폴더/문서도 삭제 (CASCADE).
ALTER TABLE "Folder"
  ADD CONSTRAINT "Folder_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Document"
  ADD CONSTRAINT "Document_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Folder_projectId_idx"               ON "Folder"("projectId");
CREATE INDEX "Document_projectId_updatedAt_idx"   ON "Document"("projectId", "updatedAt");
