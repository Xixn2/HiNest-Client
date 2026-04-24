-- 아이콘 모양(SQUIRCLE | CIRCLE). 기본은 스퀘어클.
ALTER TABLE "ServiceAccount" ADD COLUMN "iconShape" TEXT NOT NULL DEFAULT 'SQUIRCLE';
