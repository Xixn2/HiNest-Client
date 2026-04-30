-- 역할별 권한 토글 — (role, key) 한 쌍에 boolean. 기본값(default catalog) 과 다를 때만 row 생성.
CREATE TABLE "RolePermission" (
    "role" TEXT NOT NULL,             -- ADMIN | MANAGER | MEMBER
    "permKey" TEXT NOT NULL,          -- 예: "meeting.create"
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role", "permKey")
);
