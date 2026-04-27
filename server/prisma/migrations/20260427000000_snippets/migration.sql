-- 스니펫 라이브러리 — 자주 쓰는 텍스트/코드 조각.
CREATE TABLE "Snippet" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "lang" TEXT NOT NULL DEFAULT '',
  "scope" TEXT NOT NULL DEFAULT 'PRIVATE',
  "uses" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Snippet_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Snippet_ownerId_updatedAt_idx" ON "Snippet"("ownerId", "updatedAt");
CREATE INDEX "Snippet_scope_updatedAt_idx" ON "Snippet"("scope", "updatedAt");
CREATE INDEX "Snippet_trigger_idx" ON "Snippet"("trigger");

ALTER TABLE "Snippet" ADD CONSTRAINT "Snippet_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
