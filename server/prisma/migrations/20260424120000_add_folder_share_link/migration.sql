-- CreateTable: 폴더 외부 공유 링크
CREATE TABLE "FolderShareLink" (
    "id"           TEXT         NOT NULL,
    "folderId"     TEXT         NOT NULL,
    "token"        TEXT         NOT NULL,
    "createdById"  TEXT         NOT NULL,
    "expiresAt"    TIMESTAMP(3),
    "maxDownloads" INTEGER,
    "downloads"    INTEGER      NOT NULL DEFAULT 0,
    "passwordHash" TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt"    TIMESTAMP(3),
    CONSTRAINT "FolderShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FolderShareLink_token_key"    ON "FolderShareLink"("token");
CREATE INDEX        "FolderShareLink_folderId_idx" ON "FolderShareLink"("folderId");

-- AddForeignKey
ALTER TABLE "FolderShareLink"
    ADD CONSTRAINT "FolderShareLink_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "Folder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FolderShareLink"
    ADD CONSTRAINT "FolderShareLink_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
