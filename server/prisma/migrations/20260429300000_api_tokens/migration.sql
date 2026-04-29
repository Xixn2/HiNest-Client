-- 외부 통합용 API 키 (Slack/Notion/n8n 등). 평문은 발급 시 1번만 노출, 이후엔 hash 만 보관.
CREATE TABLE "ApiToken" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL, -- "hin_xxxxxxxx" 의 앞 12자, UI 식별용
    "scopes" TEXT, -- 콤마 구분 ("read:users,read:meetings")
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiToken_hash_key" ON "ApiToken"("hash");
CREATE INDEX "ApiToken_revokedAt_idx" ON "ApiToken"("revokedAt");
