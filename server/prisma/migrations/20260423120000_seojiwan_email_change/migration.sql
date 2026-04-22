-- 서지완 계정 이메일 변경: developer.seojiwan@gmail.com → xixn2@hi-vits.com
-- FK 참조가 많은 계정이라 row 를 삭제하지 않고 email 만 갈아끼움.
-- xixn2@hi-vits.com 이 이미 다른 row 로 존재하면 충돌 회피를 위해 그쪽을 비활성 + 접미사 붙임.

DO $$
DECLARE
  src_id text;
BEGIN
  SELECT id INTO src_id FROM "User" WHERE email = 'developer.seojiwan@gmail.com';

  IF src_id IS NULL THEN
    -- 원본 계정이 없으면 아무것도 안 함 (이미 한번 적용됐을 수 있음)
    RAISE NOTICE 'developer.seojiwan@gmail.com not found — skipping';
    RETURN;
  END IF;

  -- 새 주소 선점 row 가 있으면 이메일 충돌 회피
  UPDATE "User"
    SET email = 'xixn2+old-' || id || '@hi-vits.com',
        active = false
    WHERE email = 'xixn2@hi-vits.com' AND id <> src_id;

  UPDATE "User"
    SET email = 'xixn2@hi-vits.com'
    WHERE id = src_id;
END $$;
