-- 마감기한 — null 허용, 기존 항목엔 영향 없음.
ALTER TABLE "ProjectQaItem" ADD COLUMN "dueDate" TIMESTAMP(3);
CREATE INDEX "ProjectQaItem_projectId_dueDate_idx" ON "ProjectQaItem"("projectId", "dueDate");
