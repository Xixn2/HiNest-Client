-- 대규모 기능 확장: 공지 이모지 반응, 즐겨찾기(핀), 알림 환경설정, 외부 공유 링크,
-- 결재 템플릿/즐겨찾는 결재라인/반려 스레드 댓글, 회의록·문서 버전 히스토리.

-- 1. NoticeReaction
CREATE TABLE "NoticeReaction" (
  "id"        TEXT NOT NULL,
  "noticeId"  TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "emoji"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NoticeReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NoticeReaction_noticeId_userId_emoji_key" ON "NoticeReaction"("noticeId","userId","emoji");
CREATE INDEX "NoticeReaction_noticeId_idx" ON "NoticeReaction"("noticeId");
ALTER TABLE "NoticeReaction" ADD CONSTRAINT "NoticeReaction_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "Notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoticeReaction" ADD CONSTRAINT "NoticeReaction_userId_fkey"   FOREIGN KEY ("userId")   REFERENCES "User"("id")   ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Pin (폴리모픽 즐겨찾기)
CREATE TABLE "Pin" (
  "id"         TEXT NOT NULL,
  "userId"     TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId"   TEXT NOT NULL,
  "label"      TEXT,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Pin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Pin_userId_targetType_targetId_key" ON "Pin"("userId","targetType","targetId");
CREATE INDEX "Pin_userId_idx" ON "Pin"("userId");
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. NotificationPref
CREATE TABLE "NotificationPref" (
  "userId"    TEXT NOT NULL,
  "prefs"     JSONB NOT NULL DEFAULT '{}',
  "dndStart"  TEXT,
  "dndEnd"    TEXT,
  "emailOn"   BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPref_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "NotificationPref" ADD CONSTRAINT "NotificationPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. DocumentShareLink + ShareLinkAccess
CREATE TABLE "DocumentShareLink" (
  "id"            TEXT NOT NULL,
  "documentId"    TEXT NOT NULL,
  "token"         TEXT NOT NULL,
  "createdById"   TEXT NOT NULL,
  "expiresAt"     TIMESTAMP(3),
  "maxDownloads"  INTEGER,
  "downloads"     INTEGER NOT NULL DEFAULT 0,
  "passwordHash"  TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt"     TIMESTAMP(3),
  CONSTRAINT "DocumentShareLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentShareLink_token_key" ON "DocumentShareLink"("token");
CREATE INDEX "DocumentShareLink_documentId_idx" ON "DocumentShareLink"("documentId");
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_documentId_fkey"  FOREIGN KEY ("documentId")  REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentShareLink" ADD CONSTRAINT "DocumentShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id")     ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ShareLinkAccess" (
  "id"        TEXT NOT NULL,
  "linkId"    TEXT NOT NULL,
  "action"    TEXT NOT NULL,
  "ip"        TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShareLinkAccess_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ShareLinkAccess_linkId_createdAt_idx" ON "ShareLinkAccess"("linkId","createdAt");
ALTER TABLE "ShareLinkAccess" ADD CONSTRAINT "ShareLinkAccess_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "DocumentShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. ApprovalTemplate + ApprovalLineFavorite + ApprovalComment
CREATE TABLE "ApprovalTemplate" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "scope"       TEXT NOT NULL DEFAULT 'ALL',
  "scopeTeam"   TEXT,
  "body"        JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApprovalTemplate_createdById_idx" ON "ApprovalTemplate"("createdById");

CREATE TABLE "ApprovalLineFavorite" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "reviewerIds" TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalLineFavorite_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApprovalLineFavorite_userId_idx" ON "ApprovalLineFavorite"("userId");
ALTER TABLE "ApprovalLineFavorite" ADD CONSTRAINT "ApprovalLineFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ApprovalComment" (
  "id"         TEXT NOT NULL,
  "approvalId" TEXT NOT NULL,
  "authorId"   TEXT NOT NULL,
  "content"    TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApprovalComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApprovalComment_approvalId_createdAt_idx" ON "ApprovalComment"("approvalId","createdAt");
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "Approval"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalComment" ADD CONSTRAINT "ApprovalComment_authorId_fkey"   FOREIGN KEY ("authorId")   REFERENCES "User"("id")     ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Approval.revisedFromId (반려 후 재상신 추적)
ALTER TABLE "Approval" ADD COLUMN "revisedFromId" TEXT;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_revisedFromId_fkey" FOREIGN KEY ("revisedFromId") REFERENCES "Approval"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. MeetingRevision + DocumentRevision
CREATE TABLE "MeetingRevision" (
  "id"        TEXT NOT NULL,
  "meetingId" TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "content"   JSONB NOT NULL,
  "editorId"  TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MeetingRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MeetingRevision_meetingId_createdAt_idx" ON "MeetingRevision"("meetingId","createdAt");
ALTER TABLE "MeetingRevision" ADD CONSTRAINT "MeetingRevision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingRevision" ADD CONSTRAINT "MeetingRevision_editorId_fkey"  FOREIGN KEY ("editorId")  REFERENCES "User"("id")    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DocumentRevision" (
  "id"          TEXT NOT NULL,
  "documentId"  TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "fileUrl"     TEXT,
  "fileName"    TEXT,
  "fileType"    TEXT,
  "fileSize"    INTEGER,
  "editorId"    TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentRevision_documentId_createdAt_idx" ON "DocumentRevision"("documentId","createdAt");
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentRevision" ADD CONSTRAINT "DocumentRevision_editorId_fkey"   FOREIGN KEY ("editorId")   REFERENCES "User"("id")     ON DELETE CASCADE ON UPDATE CASCADE;
