-- 비밀번호 재설정 토큰 — 잠긴 계정도 본인 이메일 인증으로 풀 수 있도록.
-- 실제 토큰 값은 응답에만 한 번 노출되고, DB 엔 SHA-256 해시만 보관한다.

CREATE TABLE "PasswordResetToken" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "usedAt"      TIMESTAMP(3),
  "ipRequested" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordResetToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key"
  ON "PasswordResetToken" ("tokenHash");

CREATE INDEX "PasswordResetToken_userId_createdAt_idx"
  ON "PasswordResetToken" ("userId", "createdAt");

CREATE INDEX "PasswordResetToken_expiresAt_idx"
  ON "PasswordResetToken" ("expiresAt");
