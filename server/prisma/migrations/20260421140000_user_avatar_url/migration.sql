-- 사용자 프로필 이미지 URL. null 이면 기존 avatarColor + 이니셜로 fallback.
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
