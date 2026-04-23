-- 테스트 관리자 계정 생성.
--   email:    test@hi-vits.com
--   password: test1234!
--   role:     ADMIN (superAdmin=false — 총관리자 아님, 기능 테스트용)
-- 이미 존재하면 비밀번호/권한만 재설정해 멱등.

DO $$
DECLARE
  target_hash text := '$2a$10$ar6mHrmxmXmX1.1/fxYzKurEKd0kQy5ix21AAO1nGjH54BK1eiV/6';
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE email = 'test@hi-vits.com') THEN
    UPDATE "User"
      SET "passwordHash" = target_hash,
          role = 'ADMIN',
          "superAdmin" = false,
          active = true,
          "resignedAt" = NULL,
          name = '테스트관리자'
      WHERE email = 'test@hi-vits.com';
  ELSE
    INSERT INTO "User" (id, email, name, "passwordHash", role, "superAdmin", active, "avatarColor", "createdAt", "updatedAt")
    VALUES (
      'cmo_test_admin_seed',
      'test@hi-vits.com',
      '테스트관리자',
      target_hash,
      'ADMIN',
      false,
      true,
      '#F59E0B',
      NOW(),
      NOW()
    );
  END IF;
END $$;
