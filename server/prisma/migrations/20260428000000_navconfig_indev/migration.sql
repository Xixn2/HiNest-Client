-- 사이드바 메뉴 항목 \"개발 중\" 상태 — 사이드바에는 정상 노출하지만 라우트 진입 시 안내 화면.
ALTER TABLE "NavConfig" ADD COLUMN "inDev" BOOLEAN NOT NULL DEFAULT false;
