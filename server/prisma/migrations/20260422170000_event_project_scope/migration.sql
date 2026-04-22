-- 전사 캘린더 Event 테이블에 projectId 추가. scope=PROJECT 로 프로젝트 멤버 전용 일정.
ALTER TABLE "Event" ADD COLUMN "projectId" TEXT;

ALTER TABLE "Event" ADD CONSTRAINT "Event_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Event_projectId_startAt_idx" ON "Event"("projectId", "startAt");
