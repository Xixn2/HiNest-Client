-- 서비스 계정 커스텀 로고 URL. null 이면 URL/이름 기반 favicon 을 클라에서 자동 추측.
ALTER TABLE "ServiceAccount" ADD COLUMN "iconUrl" TEXT;
