-- 4개 테이블 (Meeting / Document / Journal / Notice) 에 소프트 삭제 컬럼 추가.
-- deletedAt 가 NULL 이 아니면 휴지통에 들어간 상태. 30일 후 영구 삭제 권장.
ALTER TABLE "Meeting"  ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Document" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Journal"  ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Notice"   ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "deletedById" TEXT;

CREATE INDEX "Meeting_deletedAt_idx"  ON "Meeting"("deletedAt");
CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");
CREATE INDEX "Journal_deletedAt_idx"  ON "Journal"("deletedAt");
CREATE INDEX "Notice_deletedAt_idx"   ON "Notice"("deletedAt");
