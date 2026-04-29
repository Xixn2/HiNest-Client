-- 기능 플래그 — 단일 키 단위 ON/OFF + 범위(전사/역할/유저/팀) 한정.
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL', -- GLOBAL | ROLE | USER | TEAM
    "targets" TEXT,                          -- 콤마 구분 (role: ADMIN,MANAGER / userId / team 명)
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);
