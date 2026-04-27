-- 사이드바 메뉴 항목 표시 여부 (전사) — 총관리자 토글.
CREATE TABLE "NavConfig" (
  "path" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" TEXT,
  CONSTRAINT "NavConfig_pkey" PRIMARY KEY ("path")
);
