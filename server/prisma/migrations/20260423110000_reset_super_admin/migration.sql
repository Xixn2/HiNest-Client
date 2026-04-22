-- 슈퍼어드민 재설정:
--   - 기존 admin@hinest.local 계정은 admin@hivits.com 으로 이메일을 변경하고 비밀번호/권한을 재설정.
--     (작성한 공지/채팅/로그 FK 참조 때문에 row 를 삭제하지 않고 이메일/해시/권한만 덮어씀.)
--   - 만약 admin@hinest.local 이 존재하지 않으면 새 row 를 만들어 슈퍼어드민 생성.
--   - 이미 admin@hivits.com 이 존재하면(중복 시) 비밀번호/권한만 재설정.
-- bcrypt 해시는 "jiwan2846!" 를 cost 10 으로 미리 계산해 박아둠 — SQL 안에서 bcrypt 를 돌릴 수 없음.

DO $$
DECLARE
  target_hash text := '$2a$10$42SxnzPWgJ1qsRLd0ohxDuVfrvH2K3ARTsw6jTywwtuLWegeM0xUu';
  existing_id text;
BEGIN
  -- 1) 기존 admin@hinest.local 이 있으면 이메일만 새 주소로 바꾸고 나머지 필드 재설정
  SELECT id INTO existing_id FROM "User" WHERE email = 'admin@hinest.local';

  IF existing_id IS NOT NULL THEN
    -- admin@hivits.com 에 이미 다른 row 가 있으면 먼저 그 row 를 비활성화해 이메일 충돌 회피
    UPDATE "User"
      SET email = 'admin+old-' || id || '@hivits.com',
          active = false
      WHERE email = 'admin@hivits.com' AND id <> existing_id;

    UPDATE "User"
      SET email = 'admin@hivits.com',
          name = '관리자',
          "passwordHash" = target_hash,
          "superAdmin" = true,
          role = 'ADMIN',
          active = true,
          "resignedAt" = NULL
      WHERE id = existing_id;

  ELSE
    -- 2) 기존 admin 이 아예 없으면: admin@hivits.com row 가 있는지 확인 후 업데이트 or insert
    IF EXISTS (SELECT 1 FROM "User" WHERE email = 'admin@hivits.com') THEN
      UPDATE "User"
        SET name = '관리자',
            "passwordHash" = target_hash,
            "superAdmin" = true,
            role = 'ADMIN',
            active = true,
            "resignedAt" = NULL
        WHERE email = 'admin@hivits.com';
    ELSE
      INSERT INTO "User" (id, email, name, "passwordHash", role, "superAdmin", active, "avatarColor", "createdAt", "updatedAt")
      VALUES (
        'cmo_reset_super_admin_seed',
        'admin@hivits.com',
        '관리자',
        target_hash,
        'ADMIN',
        true,
        true,
        '#36D7B7',
        NOW(),
        NOW()
      );
    END IF;
  END IF;
END $$;
