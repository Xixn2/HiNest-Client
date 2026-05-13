-- 직전 시드(20260514100000_seed_week_schedule) 가 넣은 더미 일정/공지 전부 제거.
-- + 서지완 계정의 2026-05-14 오늘자 출근 기록을 6시간 20분 으로 세팅.
--
-- 정확성 보호:
--   1) 시드 Event 는 인서트 시 사용한 정확한 (title, scope, category, startAt) 조합으로만 매칭.
--      운영자가 같은 제목으로 따로 추가했더라도 시각/스코프까지 일치할 가능성이 매우 낮음.
--   2) 시드 Notice 는 시드 전용 이모지 프리픽스(📅/🎉/🔐/💼) + 정확한 title 로 매칭.

-- ===================== 1) 시드 Event 제거 =====================
DELETE FROM "Event"
WHERE ("title", scope, category, "startAt") IN (
  ('주간 스탠드업',                'COMPANY',  'MEETING',  '2026-05-11 00:30:00'::timestamp),
  ('제품 로드맵 리뷰',             'TEAM',     'MEETING',  '2026-05-11 05:00:00'::timestamp),
  ('디자인 시스템 v2 워크샵',      'TEAM',     'MEETING',  '2026-05-12 01:00:00'::timestamp),
  ('신입 백엔드 1차 면접',         'PERSONAL', 'MEETING',  '2026-05-12 07:00:00'::timestamp),
  ('마케팅 캠페인 점검',           'TEAM',     'MEETING',  '2026-05-13 01:00:00'::timestamp),
  ('엔지니어링 싱크',              'TEAM',     'MEETING',  '2026-05-13 06:00:00'::timestamp),
  ('분기 OKR 점검',                'COMPANY',  'MEETING',  '2026-05-14 02:00:00'::timestamp),
  ('디자인 리뷰',                  'TEAM',     'MEETING',  '2026-05-14 05:00:00'::timestamp),
  ('결재 마감일 — 5월 출장 정산',   'COMPANY',  'DEADLINE', '2026-05-14 09:00:00'::timestamp),
  ('1:1 매니저 미팅',              'PERSONAL', 'MEETING',  '2026-05-15 01:00:00'::timestamp),
  ('전사 타운홀',                  'COMPANY',  'EVENT',    '2026-05-15 06:00:00'::timestamp),
  ('5월 정기 회식',                'COMPANY',  'EVENT',    '2026-05-15 09:00:00'::timestamp)
);

-- ===================== 2) 시드 Notice 제거 =====================
DELETE FROM "Notice"
WHERE title IN (
  '📅 5월 둘째 주 주요 일정 안내',
  '🎉 신규 입사자 환영',
  '🔐 데스크톱 앱 v1.4 보안 패치 안내',
  '💼 5월 출장·외근 정산 마감일'
);

-- ===================== 3) 서지완 2026-05-14 출근 기록 =====================
-- checkIn 09:00 KST (= 00:00 UTC), checkOut 15:20 KST (= 06:20 UTC) → 정확히 6시간 20분.
-- Attendance 의 (userId, date) UNIQUE 제약 → UPSERT 로 멱등 보장.
DO $$
DECLARE
  uid TEXT;
BEGIN
  SELECT id INTO uid
  FROM "User"
  WHERE name = '서지완'
    AND active = TRUE
    AND "resignedAt" IS NULL
  ORDER BY "createdAt" ASC
  LIMIT 1;

  IF uid IS NULL THEN
    RAISE NOTICE '서지완 계정을 찾지 못해 출근 기록을 건너뜁니다.';
    RETURN;
  END IF;

  INSERT INTO "Attendance" (id, "userId", date, "checkIn", "checkOut")
  VALUES (
    gen_random_uuid()::text,
    uid,
    '2026-05-14',
    '2026-05-14 00:00:00'::timestamp, -- 09:00 KST
    '2026-05-14 06:20:00'::timestamp  -- 15:20 KST → 6h 20m
  )
  ON CONFLICT ("userId", date) DO UPDATE
  SET "checkIn"  = EXCLUDED."checkIn",
      "checkOut" = EXCLUDED."checkOut";

  RAISE NOTICE '서지완 5/14 출근 6h 20m 세팅 완료.';
END $$;
