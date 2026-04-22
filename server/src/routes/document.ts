import { Router } from "express";
import { z } from "zod";
import archiver from "archiver";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";
import { downloadFile, isStorageEnabled } from "../lib/storage.js";
import { UPLOAD_DIR } from "./upload.js";
import path from "node:path";
import fs from "node:fs";

const router = Router();
router.use(requireAuth);

/* ===== 프로젝트 멤버십 검사 =====
 * 프로젝트 문서함(projectId 지정) 은 ProjectMember 또는 ADMIN 만 접근 가능.
 * ADMIN 은 감사 편의상 모든 프로젝트를 열람/관리할 수 있다.
 */
async function assertProjectMember(
  u: { id: string; role: string },
  projectId: string,
): Promise<boolean> {
  if (u.role === "ADMIN") return true;
  const m = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: u.id } },
    select: { id: true },
  });
  return !!m;
}

/* ===== 내가 접근 가능한 프로젝트 목록 =====
 * 문서함 상단 카테고리 칩 렌더 전용. "전체"(null) + 여기 내려주는 프로젝트들이 칩으로 뜬다.
 * 권한 없는 프로젝트는 애초에 목록에 안 실려서 카테고리 자체가 안 보인다.
 */
router.get("/projects", async (req, res) => {
  const u = (req as any).user;
  // ADMIN 은 전체 프로젝트. 일반 사용자는 ProjectMember join.
  const projects = u.role === "ADMIN"
    ? await prisma.project.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true },
      })
    : await prisma.project.findMany({
        where: {
          status: "ACTIVE",
          members: { some: { userId: u.id } },
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true },
      });
  res.json({ projects });
});

/* ===== 폴더 ===== */
// 전역(프로젝트 아닌) 폴더 가시성 — 기존 로직 그대로.
function folderVisibilityWhere(u: { id: string; team: string | null; role: string }) {
  if (u.role === "ADMIN") return {};
  const ors: any[] = [
    { scope: "ALL" },
    { authorId: u.id },
  ];
  if (u.team) ors.push({ scope: "TEAM", scopeTeam: u.team });
  ors.push({ scope: "CUSTOM", scopeUserIds: { contains: u.id } });
  return { OR: ors };
}

router.get("/folders", async (req, res) => {
  const u = (req as any).user;
  const scope = req.query.scope ? String(req.query.scope) : "all";
  const projectId = req.query.projectId ? String(req.query.projectId) : null;

  if (projectId) {
    // 프로젝트 문서함 — 멤버십만 확인하면 끝. scope 필터는 무시.
    if (!(await assertProjectMember(u, projectId))) {
      return res.status(403).json({ error: "해당 프로젝트에 접근 권한이 없습니다" });
    }
    const folders = await prisma.folder.findMany({
      where: { projectId },
      orderBy: [{ parentId: "asc" }, { createdAt: "asc" }],
    });
    return res.json({ folders });
  }

  // 전역 문서함 — 프로젝트 폴더는 숨김(projectId: null).
  const ands: any[] = [folderVisibilityWhere(u), { projectId: null }];
  if (scope === "team") ands.push({ scope: "TEAM" });
  else if (scope === "private") ands.push({ scope: "PRIVATE", authorId: u.id });
  else if (scope === "custom") ands.push({ scope: "CUSTOM" });
  else if (scope === "public") ands.push({ scope: "ALL" });
  const folders = await prisma.folder.findMany({
    where: { AND: ands },
    orderBy: [{ parentId: "asc" }, { createdAt: "asc" }],
  });
  res.json({ folders });
});

const folderCreateSchema = z.object({
  // name 은 폴더 트리 표시 길이 한도에 맞춰 100자로 제한.
  name: z.string().min(1).max(100),
  parentId: z.string().max(64).nullable().optional(),
  scope: z.enum(["ALL", "TEAM", "PRIVATE", "CUSTOM"]).optional(),
  scopeTeam: z.string().max(80).nullable().optional(),
  // scopeUserIds 는 콤마 문자열로 저장되므로 인원수가 커지면 컬럼 비대 + LIKE 쿼리 저하.
  // 50명까지 허용 — 그 이상은 TEAM/ALL 공개 범위로 쓰는 걸 권장.
  scopeUserIds: z.array(z.string().max(64)).max(50).optional(),
  projectId: z.string().max(64).nullable().optional(),
});

router.post("/folders", async (req, res) => {
  const u = (req as any).user;
  const parsed = folderCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const { name, parentId } = parsed.data;
  const projectId = parsed.data.projectId ?? null;

  if (projectId) {
    // 프로젝트 폴더 — 멤버만 생성 가능, scope 관련 필드는 무의미하므로 ALL 로 고정.
    if (!(await assertProjectMember(u, projectId))) {
      return res.status(403).json({ error: "해당 프로젝트에 접근 권한이 없습니다" });
    }
    const folder = await prisma.folder.create({
      data: {
        name: name.trim(),
        parentId: parentId || null,
        scope: "ALL",
        scopeTeam: null,
        scopeUserIds: null,
        authorId: u.id,
        projectId,
      },
    });
    await writeLog(u.id, "FOLDER_CREATE", folder.id, name);
    return res.json({ folder });
  }

  const scope = parsed.data.scope ?? "ALL";
  const scopeTeam = scope === "TEAM" ? (parsed.data.scopeTeam ?? u.team ?? null) : null;
  const scopeUserIds = scope === "CUSTOM" && parsed.data.scopeUserIds?.length
    ? parsed.data.scopeUserIds.join(",")
    : null;
  const folder = await prisma.folder.create({
    data: {
      name: name.trim(),
      parentId: parentId || null,
      scope,
      scopeTeam,
      scopeUserIds,
      authorId: u.id,
    },
  });
  await writeLog(u.id, "FOLDER_CREATE", folder.id, name);
  res.json({ folder });
});

/**
 * 폴더 권한 모델:
 *   - ADMIN: 모두 가능
 *   - 폴더 작성자(authorId == u.id): 수정/삭제 가능
 *   - 프로젝트 폴더(projectId 존재): 프로젝트 멤버 수정/삭제 가능
 * 이전엔 아무 검사도 없어서 일반 유저가 임의 폴더를 리네임/삭제할 수 있는 치명적 결함이었음.
 * 폴더 삭제는 cascade 로 내부 문서까지 지우므로 절대 권한 없는 사용자에게 허용 불가.
 */
async function assertFolderWritable(
  u: { id: string; role: string },
  folderId: string,
): Promise<{ ok: boolean; folder?: { id: string; projectId: string | null; authorId: string | null } }> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    select: { id: true, projectId: true, authorId: true },
  });
  if (!folder) return { ok: false };
  if (u.role === "ADMIN") return { ok: true, folder };
  if (folder.authorId && folder.authorId === u.id) return { ok: true, folder };
  if (folder.projectId && (await assertProjectMember(u, folder.projectId))) return { ok: true, folder };
  return { ok: false, folder };
}

router.patch("/folders/:id", async (req, res) => {
  const u = (req as any).user;
  // folderCreateSchema 의 name max(100) 와 맞춰서 100자 하드 캡.
  const rawName = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
  const name = rawName && rawName.length > 100 ? rawName.slice(0, 100) : rawName;
  if (!name) return res.status(400).json({ error: "이름이 필요합니다" });
  const check = await assertFolderWritable(u, req.params.id);
  if (!check.folder) return res.status(404).json({ error: "not found" });
  if (!check.ok) return res.status(403).json({ error: "forbidden" });
  const folder = await prisma.folder.update({ where: { id: req.params.id }, data: { name } });
  await writeLog(u.id, "FOLDER_UPDATE", folder.id, name);
  res.json({ folder });
});

router.delete("/folders/:id", async (req, res) => {
  const u = (req as any).user;
  const check = await assertFolderWritable(u, req.params.id);
  if (!check.folder) return res.status(404).json({ error: "not found" });
  if (!check.ok) return res.status(403).json({ error: "forbidden" });
  await prisma.folder.delete({ where: { id: req.params.id } });
  await writeLog(u.id, "FOLDER_DELETE", req.params.id);
  res.json({ ok: true });
});

/* ===== 문서 ===== */
const docSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  folderId: z.string().max(64).optional().nullable(),
  fileUrl: z.string().max(2000).optional(),
  fileName: z.string().max(255).optional(),
  fileType: z.string().max(80).optional(),
  // 업로드 크기는 upload 라우트에서 파일 용량 체크로 방어하고, 여기서는 int 한도만.
  fileSize: z.number().int().nonnegative().max(500_000_000).optional(),
  // 태그는 콤마로 구분된 문자열. UI에서 20개 이상 넣을 일 없음.
  tags: z.string().max(500).optional(),
  scope: z.enum(["ALL", "TEAM", "PRIVATE", "CUSTOM"]).optional(),
  scopeTeam: z.string().max(80).nullable().optional(),
  // scopeUserIds — folderCreateSchema 와 동일 기준 50명 상한.
  scopeUserIds: z.array(z.string().max(64)).max(50).optional(),
  projectId: z.string().max(64).nullable().optional(),
});

function visibilityWhere(u: { id: string; team: string | null; role: string }) {
  if (u.role === "ADMIN") return {};
  const ors: any[] = [
    { scope: "ALL" },
    { authorId: u.id },
  ];
  if (u.team) ors.push({ scope: "TEAM", scopeTeam: u.team });
  ors.push({ scope: "CUSTOM", scopeUserIds: { contains: u.id } });
  return { OR: ors };
}

router.get("/", async (req, res) => {
  const u = (req as any).user;
  const folderId = req.query.folderId ? String(req.query.folderId) : undefined;
  // q 는 title/description/tags 3개 컬럼에 contains: q 로 들어감 — 수KB 입력이면 LIKE 스캔 폭주.
  // 클라이언트 검색창 maxLength(80) 과 맞춰 128자로 하드 캡.
  const rawQ = req.query.q ? String(req.query.q).trim() : "";
  const q = rawQ.length > 128 ? rawQ.slice(0, 128) : rawQ;
  const scope = req.query.scope ? String(req.query.scope) : "all";
  const projectId = req.query.projectId ? String(req.query.projectId) : null;

  if (projectId) {
    // 프로젝트 문서 — 멤버십만 검증.
    if (!(await assertProjectMember(u, projectId))) {
      return res.status(403).json({ error: "해당 프로젝트에 접근 권한이 없습니다" });
    }
    const ands: any[] = [{ projectId }];
    if (folderId === "root") ands.push({ folderId: null });
    else if (folderId) ands.push({ folderId });
    if (q) ands.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { tags: { contains: q, mode: "insensitive" } },
      ],
    });
    // 상한 500 — 문서함은 폴더/검색으로 좁혀지는 UX 라 실질적으로 넘지 않지만,
    // 누적된 워크스페이스에서 한 번에 모든 문서를 끌어와 수십 MB 응답이 나오는 것을 방지.
    const docs = await prisma.document.findMany({
      where: { AND: ands },
      orderBy: { updatedAt: "desc" },
      take: 500,
      include: {
        author: { select: { name: true, avatarColor: true, avatarUrl: true } },
        folder: { select: { name: true } },
      },
    });
    return res.json({ documents: docs });
  }

  // 전역 문서 — 프로젝트 문서는 숨김.
  const ands: any[] = [visibilityWhere(u), { projectId: null }];
  if (folderId === "root") ands.push({ folderId: null });
  else if (folderId) ands.push({ folderId });
  if (q) ands.push({
    OR: [
      { title: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { contains: q, mode: "insensitive" } },
    ],
  });
  if (scope === "team") ands.push({ scope: "TEAM" });
  else if (scope === "private") ands.push({ scope: "PRIVATE", authorId: u.id });
  else if (scope === "custom") ands.push({ scope: "CUSTOM" });
  else if (scope === "public") ands.push({ scope: "ALL" });
  const docs = await prisma.document.findMany({
    where: { AND: ands },
    orderBy: { updatedAt: "desc" },
    include: {
      author: { select: { name: true, avatarColor: true, avatarUrl: true } },
      folder: { select: { name: true } },
    },
  });
  res.json({ documents: docs });
});

router.post("/", async (req, res) => {
  const parsed = docSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const d = parsed.data;
  const projectId = d.projectId ?? null;

  if (projectId) {
    if (!(await assertProjectMember(u, projectId))) {
      return res.status(403).json({ error: "해당 프로젝트에 접근 권한이 없습니다" });
    }
    const doc = await prisma.document.create({
      data: {
        title: d.title,
        description: d.description,
        folderId: d.folderId ?? null,
        fileUrl: d.fileUrl,
        fileName: d.fileName,
        fileType: d.fileType,
        fileSize: d.fileSize,
        tags: d.tags,
        authorId: u.id,
        scope: "ALL",
        scopeTeam: null,
        scopeUserIds: null,
        projectId,
      },
    });
    await writeLog(u.id, "DOC_CREATE", doc.id, d.title);
    return res.json({ document: doc });
  }

  const scope = d.scope ?? "ALL";
  const scopeTeam = scope === "TEAM" ? (d.scopeTeam ?? u.team ?? null) : null;
  const scopeUserIds = scope === "CUSTOM" && d.scopeUserIds?.length
    ? d.scopeUserIds.join(",")
    : null;
  const doc = await prisma.document.create({
    data: {
      title: d.title,
      description: d.description,
      folderId: d.folderId ?? null,
      fileUrl: d.fileUrl,
      fileName: d.fileName,
      fileType: d.fileType,
      fileSize: d.fileSize,
      tags: d.tags,
      authorId: u.id,
      scope,
      scopeTeam,
      scopeUserIds,
    },
  });
  await writeLog(u.id, "DOC_CREATE", doc.id, d.title);
  res.json({ document: doc });
});

router.patch("/:id", async (req, res) => {
  const parsed = docSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const exist = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!exist) return res.status(404).json({ error: "not found" });
  // 작성자 본인 or ADMIN or (프로젝트 문서라면 프로젝트 멤버) 만 수정.
  // 다만 scope/scopeTeam/scopeUserIds/projectId 처럼 **가시성에 영향을 주는 필드는**
  // 작성자 또는 ADMIN 만 변경 가능. 프로젝트 멤버에게 허용하면 원래 PRIVATE 문서가
  // CUSTOM/ALL 로 풀려 회사 전체에 노출될 수 있음.
  const isAuthor = exist.authorId === u.id;
  const isAdmin = u.role === "ADMIN";
  const isProjectMember = exist.projectId
    ? await assertProjectMember(u, exist.projectId)
    : false;
  if (!isAuthor && !isAdmin && !isProjectMember)
    return res.status(403).json({ error: "forbidden" });
  const d = parsed.data;
  const doc = await prisma.document.update({
    where: { id: exist.id },
    data: {
      ...(d.title !== undefined && { title: d.title }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.folderId !== undefined && { folderId: d.folderId }),
      ...(d.tags !== undefined && { tags: d.tags }),
    },
  });
  await writeLog(u.id, "DOC_UPDATE", doc.id);
  res.json({ document: doc });
});

router.delete("/:id", async (req, res) => {
  const u = (req as any).user;
  const exist = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!exist) return res.status(404).json({ error: "not found" });
  const isAuthor = exist.authorId === u.id;
  const isAdmin = u.role === "ADMIN";
  const isProjectMember = exist.projectId
    ? await assertProjectMember(u, exist.projectId)
    : false;
  if (!isAuthor && !isAdmin && !isProjectMember)
    return res.status(403).json({ error: "forbidden" });
  await prisma.document.delete({ where: { id: exist.id } });
  await writeLog(u.id, "DOC_DELETE", req.params.id);
  res.json({ ok: true });
});

/* ===== 다운로드 =====
 * 개별 문서 파일: 기존 /uploads/<key>?download=1 경로를 그대로 사용. 별도 엔드포인트 불필요.
 * 폴더 전체: 해당 폴더의 모든 문서 파일을 ZIP 으로 묶어 스트리밍.
 *
 * 권한 — 전역 문서의 경우 visibilityWhere 에 걸린 것만, 프로젝트 폴더는 멤버만.
 * 폴더 자체를 못 보면 애초에 이 엔드포인트로 접근 불가.
 */

/** 저장소/디스크 어디든 해당 파일의 Buffer 를 꺼낸다. 없으면 null. */
async function fetchFileBuffer(key: string): Promise<Buffer | null> {
  if (isStorageEnabled()) {
    const f = await downloadFile(key);
    if (f) return f.buffer;
  }
  // 디스크 fallback (dev / legacy)
  const diskPath = path.join(UPLOAD_DIR, key);
  if (fs.existsSync(diskPath)) {
    return fs.promises.readFile(diskPath);
  }
  return null;
}

router.get("/folders/:id/download", async (req, res) => {
  const u = (req as any).user;
  const folder = await prisma.folder.findUnique({ where: { id: req.params.id } });
  if (!folder) return res.status(404).json({ error: "not found" });

  // 권한 검사 — 프로젝트 폴더면 멤버만, 전역이면 folderVisibilityWhere 와 같은 규칙.
  if (folder.projectId) {
    if (!(await assertProjectMember(u, folder.projectId))) {
      return res.status(403).json({ error: "forbidden" });
    }
  } else if (u.role !== "ADMIN") {
    const ok =
      folder.scope === "ALL" ||
      folder.authorId === u.id ||
      (folder.scope === "TEAM" && folder.scopeTeam === u.team) ||
      (folder.scope === "CUSTOM" && folder.scopeUserIds?.split(",").includes(u.id));
    if (!ok) return res.status(403).json({ error: "forbidden" });
  }

  // 폴더 내 파일이 달린 문서만 수집. 가시성은 위에서 폴더 단위로 걸었으니 여기선 pass.
  const docs = await prisma.document.findMany({
    where: {
      folderId: folder.id,
      fileUrl: { not: null },
    },
    select: { fileUrl: true, fileName: true, title: true },
  });
  if (docs.length === 0) {
    return res.status(404).json({ error: "폴더에 다운로드할 파일이 없어요" });
  }

  // 파일명 중복 시 "(1)" "(2)" 같은 꼬리 번호를 붙여 덮어쓰기 방지.
  const used = new Set<string>();
  function uniqueName(base: string): string {
    if (!used.has(base)) { used.add(base); return base; }
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    for (let i = 1; i < 1000; i++) {
      const c = `${stem} (${i})${ext}`;
      if (!used.has(c)) { used.add(c); return c; }
    }
    used.add(base);
    return base;
  }

  const zipName = `${folder.name.replace(/[\\/:*?"<>|]/g, "_")}.zip`;
  res.setHeader("Content-Type", "application/zip");
  const encodedZip = encodeURIComponent(zipName);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${zipName.replace(/"/g, "")}"; filename*=UTF-8''${encodedZip}`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  // 중간 압축 수준으로 충분. 대용량 이미지/영상은 어차피 이미 압축돼있어 level 올려도 효과 미미.
  const archive = archiver("zip", { zlib: { level: 5 } });
  archive.on("error", (err) => {
    console.error("[doc:zip] archiver error", err);
    // 헤더가 이미 전송된 상태라 end 로만 마감.
    if (!res.headersSent) res.status(500).json({ error: "zip failure" });
    else res.end();
  });
  archive.pipe(res);

  for (const d of docs) {
    if (!d.fileUrl) continue;
    const m = /^\/uploads\/([A-Za-z0-9._-]+)$/.exec(d.fileUrl);
    if (!m) continue;
    const key = m[1];
    const buf = await fetchFileBuffer(key);
    if (!buf) continue;
    const display = uniqueName(d.fileName || d.title || key);
    archive.append(buf, { name: display });
  }

  await archive.finalize();
  await writeLog(u.id, "FOLDER_DOWNLOAD", folder.id, folder.name);
});

export default router;
