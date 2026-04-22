-- ProjectQaItem: add screen + assignee metadata (both nullable → additive).
ALTER TABLE "ProjectQaItem"
  ADD COLUMN "screen"     TEXT,
  ADD COLUMN "platform"   TEXT,
  ADD COLUMN "assigneeId" TEXT;

CREATE INDEX "ProjectQaItem_projectId_assigneeId_idx"
  ON "ProjectQaItem"("projectId", "assigneeId");

-- ProjectQaAttachment: images/videos/files attached to a QA item.
CREATE TABLE "ProjectQaAttachment" (
  "id" TEXT NOT NULL,
  "qaItemId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectQaAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProjectQaAttachment_qaItemId_createdAt_idx"
  ON "ProjectQaAttachment"("qaItemId", "createdAt");

ALTER TABLE "ProjectQaAttachment"
  ADD CONSTRAINT "ProjectQaAttachment_qaItemId_fkey"
  FOREIGN KEY ("qaItemId") REFERENCES "ProjectQaItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
