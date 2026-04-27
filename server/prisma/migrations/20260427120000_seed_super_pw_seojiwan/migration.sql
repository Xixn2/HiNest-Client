-- 서지완 계정 superPasswordHash 초기값 설정 (bcrypt cost 12, plain="2846070802").
-- 나중엔 /api/auth/super-password 엔드포인트로 변경 가능.
-- 이미 설정돼 있으면 건드리지 않음(멱등).
UPDATE "User"
SET "superPasswordHash" = '$2a$12$OTy5aODW/r42WzJZCvCUHefGliPlO4lWyj5ld3v.YzpULL18jaAM6'
WHERE name = '서지완'
  AND "superPasswordHash" IS NULL;
