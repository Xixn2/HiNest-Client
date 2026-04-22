-- 이메일 도메인 하이픈 포함으로 통일:
--   admin@hivits.com  → admin@hi-vits.com
--   developer.seojiwan@gmail.com → xixn2@hi-vits.com (이전 마이그레이션 재시도 — 멱등)
-- 모두 row 유지, 이메일만 교체. 충돌 시 기존 선점 row 는 접미사로 회피.

DO $$
DECLARE
  admin_id text;
  jiwan_id text;
BEGIN
  -- 1) admin@hivits.com → admin@hi-vits.com
  SELECT id INTO admin_id FROM "User" WHERE email = 'admin@hivits.com';
  IF admin_id IS NOT NULL THEN
    UPDATE "User"
      SET email = 'admin+old-' || id || '@hi-vits.com',
          active = false
      WHERE email = 'admin@hi-vits.com' AND id <> admin_id;

    UPDATE "User" SET email = 'admin@hi-vits.com' WHERE id = admin_id;
  END IF;

  -- 2) 서지완 계정 (이전 마이그레이션이 안 먹었을 수 있음 — 여기서 한 번 더 시도)
  SELECT id INTO jiwan_id FROM "User" WHERE email = 'developer.seojiwan@gmail.com';
  IF jiwan_id IS NOT NULL THEN
    UPDATE "User"
      SET email = 'xixn2+old-' || id || '@hi-vits.com',
          active = false
      WHERE email = 'xixn2@hi-vits.com' AND id <> jiwan_id;

    UPDATE "User" SET email = 'xixn2@hi-vits.com' WHERE id = jiwan_id;
  END IF;
END $$;
