-- User.autoClockOutTime 추가 — "HH:mm" 문자열. null 이면 자동 퇴근 없음.
-- 스케줄러가 매 분 돌면서 현재 KST HH:mm 과 일치하는 사용자들의 오늘 Attendance 에 대해
-- checkIn 이 있고 checkOut 이 null 이면 checkOut 을 현재 시각으로 기록한다.
ALTER TABLE "User" ADD COLUMN "autoClockOutTime" TEXT;
