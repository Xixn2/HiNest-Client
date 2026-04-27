-- 서지완 계정에 총관리자 + ADMIN role 부여 (멱등 — 이미 super 면 no-op).
-- 동명이인이 생기면 이 migration 으로는 부족. 그 때 별도 처리.
UPDATE "User"
SET "superAdmin" = true,
    "role" = 'ADMIN'
WHERE name = '서지완'
  AND ("superAdmin" = false OR role <> 'ADMIN');
