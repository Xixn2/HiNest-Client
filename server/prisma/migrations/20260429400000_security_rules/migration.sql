-- Rate-limit 룰 + IP 차단 — 조기 미들웨어가 60s 캐시로 평가.
CREATE TABLE "RateLimitRule" (
    "id" TEXT NOT NULL,
    "routeGlob" TEXT NOT NULL, -- "/api/auth/*" "/api/feature-flags" etc
    "perMin" INTEGER NOT NULL DEFAULT 60,
    "perHour" INTEGER NOT NULL DEFAULT 600,
    "scope" TEXT NOT NULL DEFAULT 'ip', -- ip | user | global
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateLimitRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IpBlock" (
    "id" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,        -- "1.2.3.4/32" or "10.0.0.0/8"
    "country" TEXT,              -- ISO-2 ("CN", "RU") — set 시 IP 무시하고 cf-ipcountry 헤더로 매칭
    "reason" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    CONSTRAINT "IpBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IpBlock_enabled_idx" ON "IpBlock"("enabled");
