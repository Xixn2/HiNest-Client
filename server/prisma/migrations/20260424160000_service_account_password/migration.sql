-- 서비스 계정 비밀번호(암호화 blob) 컬럼 추가.
-- 평문 저장 금지 — 서버 라우트에서 AES-256-GCM 으로 암호화된 문자열만 들어간다.
ALTER TABLE "ServiceAccount" ADD COLUMN "passwordEnc" TEXT;
