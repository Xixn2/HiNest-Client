-- AlterTable
ALTER TABLE "ServiceAccount"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN "scopeTeam" TEXT,
  ADD COLUMN "projectId" TEXT;

-- CreateIndex
CREATE INDEX "ServiceAccount_scope_scopeTeam_idx" ON "ServiceAccount"("scope", "scopeTeam");

-- CreateIndex
CREATE INDEX "ServiceAccount_projectId_idx" ON "ServiceAccount"("projectId");

-- AddForeignKey
ALTER TABLE "ServiceAccount" ADD CONSTRAINT "ServiceAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
