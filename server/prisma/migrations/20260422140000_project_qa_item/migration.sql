-- ProjectQaItem: per-project QA checklist.
-- 신규 테이블만 추가하는 additive migration → 기존 데이터 영향 없음.
CREATE TABLE "ProjectQaItem" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "note" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProjectQaItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectQaItem_projectId_status_idx"
  ON "ProjectQaItem"("projectId", "status");

CREATE INDEX "ProjectQaItem_projectId_sortOrder_idx"
  ON "ProjectQaItem"("projectId", "sortOrder");

ALTER TABLE "ProjectQaItem"
  ADD CONSTRAINT "ProjectQaItem_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
