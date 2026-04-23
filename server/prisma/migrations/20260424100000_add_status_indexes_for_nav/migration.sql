-- nav.ts 에서 PENDING 상태 전체 카운트 시 full-scan 방지용 status 단독 인덱스.
-- Leave 는 이미 (userId, status) 인덱스가 있지만 leading column 이 userId 라
-- WHERE status = 'PENDING' 만으로 범위를 좁히는 데 사용 불가 → 별도 추가.

CREATE INDEX "CardExpense_status_idx" ON "CardExpense"("status");
CREATE INDEX "Leave_status_idx" ON "Leave"("status");
