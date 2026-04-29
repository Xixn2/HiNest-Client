-- 2FA(패스키) 강제 정책 — role 별로 필수 여부와 유예기간 지정.
CREATE TABLE "TwoFactorPolicy" (
    "role" TEXT NOT NULL,
    "requirePasskey" BOOLEAN NOT NULL DEFAULT false,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    CONSTRAINT "TwoFactorPolicy_pkey" PRIMARY KEY ("role")
);
