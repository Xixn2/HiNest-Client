-- ProjectEvent: add completion state (completed flag + who completed it + when).
-- All additive columns with safe defaults → zero-downtime on production rollout.
ALTER TABLE "ProjectEvent"
  ADD COLUMN "completed"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "completedAt"   TIMESTAMP(3),
  ADD COLUMN "completedById" TEXT;
