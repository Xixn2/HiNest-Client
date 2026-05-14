-- 회의록 첨부 — 파일/이미지/영상 또는 외부 링크.
-- content JSON 과 별개로 보관해서 본문이 다시 쓰여도 자료는 유지되고,
-- 첨부 카운트·검색·갤러리 뷰 등 별도 처리가 가능하다.

CREATE TABLE "MeetingAttachment" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "meetingId"    TEXT NOT NULL,
  "kind"         TEXT NOT NULL,                  -- FILE | IMAGE | VIDEO | LINK
  "url"          TEXT NOT NULL,                  -- /uploads/<key> 또는 외부 URL
  "name"         TEXT NOT NULL,                  -- 파일명 또는 링크 제목
  "mimeType"     TEXT,                           -- LINK 면 NULL
  "sizeBytes"    INTEGER,                        -- LINK 면 NULL
  "uploadedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MeetingAttachment_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "MeetingAttachment_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MeetingAttachment_meetingId_createdAt_idx"
  ON "MeetingAttachment" ("meetingId", "createdAt");
