-- 서비스 계정 활성 상태. false 면 "비활성"(해지/만료/중단). 기본 true.
ALTER TABLE "ServiceAccount" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
