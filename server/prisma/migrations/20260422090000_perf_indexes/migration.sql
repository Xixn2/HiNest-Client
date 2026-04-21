-- 성능 튜닝용 인덱스 일괄 추가.
-- CONCURRENTLY 는 migrate deploy 가 트랜잭션으로 묶기 때문에 못 쓰고,
-- 이 테이블들은 아직 소규모라 일반 CREATE INDEX 로도 락 시간 미미.
-- 중복 실행 안전용으로 IF NOT EXISTS.

-- 1) Notification: 리스트 조회는 (userId, createdAt desc) 정렬 기준이 핵심.
--    기존 (userId, readAt) 은 미읽음 필터용으로 유지.
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx"
  ON "Notification" ("userId", "createdAt" DESC);

-- 2) Attendance: 디렉터리 페이지가 userId IN (...) + date=today 로 한 번에 조회.
--    unique 제약이 내부적으로 인덱스를 만들긴 하지만 (userId, date) 순서라
--    date 선두 조회는 도움 X. 반대 조합도 추가.
CREATE INDEX IF NOT EXISTS "Attendance_date_userId_idx"
  ON "Attendance" ("date", "userId");

-- 3) Event (전사 캘린더): 월별 조회 — 날짜 범위가 주 키.
CREATE INDEX IF NOT EXISTS "Event_startAt_endAt_idx"
  ON "Event" ("startAt", "endAt");

-- 4) Journal: 본인 일지 최신순.
CREATE INDEX IF NOT EXISTS "Journal_userId_date_idx"
  ON "Journal" ("userId", "date" DESC);

-- 5) Notice: 핀 고정 + 최신순.
CREATE INDEX IF NOT EXISTS "Notice_pinned_createdAt_idx"
  ON "Notice" ("pinned" DESC, "createdAt" DESC);

-- 6) Leave: 본인 휴가 조회.
CREATE INDEX IF NOT EXISTS "Leave_userId_status_idx"
  ON "Leave" ("userId", "status");

-- 7) CardExpense: 본인 카드 사용내역 최신순.
CREATE INDEX IF NOT EXISTS "CardExpense_userId_usedAt_idx"
  ON "CardExpense" ("userId", "usedAt" DESC);

-- 8) Approval: 내가 요청한 결재 최신순.
CREATE INDEX IF NOT EXISTS "Approval_requesterId_createdAt_idx"
  ON "Approval" ("requesterId", "createdAt" DESC);

-- 9) AuditLog: 관리자 로그 페이지는 전체 시간순.
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"
  ON "AuditLog" ("createdAt" DESC);
