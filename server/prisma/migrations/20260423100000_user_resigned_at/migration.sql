-- 구성원 퇴사 처리: resignedAt 컬럼 추가.
-- 퇴사 처리하면 active=false 로 로그인 차단 + resignedAt 에 퇴사일(관리자가 캘린더에서 선택) 기록.
-- active 만으로 "비활성"과 "퇴사"를 구분할 수 없어서 별도 컬럼 유지 — 퇴사 이력/날짜가 HR 정보로 필요함.
ALTER TABLE "User" ADD COLUMN "resignedAt" TIMESTAMP(3);
