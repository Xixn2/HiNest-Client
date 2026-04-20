import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

/* ===== 폴더 ===== */
router.get("/folders", async (_req, res) => {
  const folders = await prisma.folder.findMany({
    orderBy: [{ parentId: "asc" }, { createdAt: "asc" }],
  });
  res.json({ folders });
});

router.post("/folders", async (req, res) => {
  const u = (req as any).user;
  const name = String(req.body?.name ?? "").trim();
  const parentId = req.body?.parentId || null;
  if (!name) return res.status(400).json({ error: "이름이 필요합니다" });
  const folder = await prisma.folder.create({ data: { name, parentId } });
  await writeLog(u.id, "FOLDER_CREATE", folder.id, name);
  res.json({ folder });
});

router.patch("/folders/:id", async (req, res) => {
  const u = (req as any).user;
  const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
  if (!name) return res.status(400).json({ error: "이름이 필요합니다" });
  const folder = await prisma.folder.update({ where: { id: req.params.id }, data: { name } });
  await writeLog(u.id, "FOLDER_UPDATE", folder.id, name);
  res.json({ folder });
});

router.delete("/folders/:id", async (req, res) => {
  const u = (req as any).user;
  await prisma.folder.delete({ where: { id: req.params.id } });
  await writeLog(u.id, "FOLDER_DELETE", req.params.id);
  res.json({ ok: true });
});

/* ===== 문서 ===== */
const docSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  folderId: z.string().optional().nullable(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  fileSize: z.number().int().optional(),
  tags: z.string().optional(),
  scope: z.enum(["ALL", "TEAM", "PRIVATE", "CUSTOM"]).optional(),
  scopeTeam: z.string().nullable().optional(),
  scopeUserIds: z.array(z.string()).optional(),
});

// 특정 유저가 볼 수 있는 문서 where 조건을 만든다.
function visibilityWhere(u: { id: string; team: string | null; role: string }) {
  // ADMIN 은 전부 볼 수 있음 — 관리 목적.
  if (u.role === "ADMIN") return {};
  const ors: any[] = [
    { scope: "ALL" },
    { authorId: u.id }, // 본인이 올린 건 항상 봄
  ];
  if (u.team) ors.push({ scope: "TEAM", scopeTeam: u.team });
  // CUSTOM — scopeUserIds 콤마 문자열에 내 id 포함
  ors.push({ scope: "CUSTOM", scopeUserIds: { contains: u.id } });
  return { OR: ors };
}

router.get("/", async (req, res) => {
  const u = (req as any).user;
  const folderId = req.query.folderId ? String(req.query.folderId) : undefined;
  const q = req.query.q ? String(req.query.q).trim() : "";
  const scope = req.query.scope ? String(req.query.scope) : "all";
  // 기본은 가시성 필터 적용 (내가 볼 수 있는 문서만).
  const ands: any[] = [visibilityWhere(u)];
  if (folderId === "root") ands.push({ folderId: null });
  else if (folderId) ands.push({ folderId });
  if (q) ands.push({
    OR: [
      { title: { contains: q } },
      { description: { contains: q } },
      { tags: { contains: q } },
    ],
  });
  // scope 탭: 전체(all) | 팀(team) | 개인(private = 내 PRIVATE) | 사용자지정(custom = CUSTOM 대상)
  if (scope === "team") ands.push({ scope: "TEAM" });
  else if (scope === "private") ands.push({ scope: "PRIVATE", authorId: u.id });
  else if (scope === "custom") ands.push({ scope: "CUSTOM" });
  else if (scope === "public") ands.push({ scope: "ALL" });
  // scope === "all" 은 가시성 전체 — 추가 조건 없음
  const docs = await prisma.document.findMany({
    where: { AND: ands },
    orderBy: { updatedAt: "desc" },
    include: {
      author: { select: { name: true, avatarColor: true } },
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
  // scope 기본값 = ALL. TEAM 일 때 팀명이 비면 작성자 팀으로, CUSTOM 은 허용 유저 콤마문자열 저장.
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
  if (exist.authorId !== u.id && u.role !== "ADMIN")
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
  if (exist.authorId !== u.id && u.role !== "ADMIN")
    return res.status(403).json({ error: "forbidden" });
  await prisma.document.delete({ where: { id: exist.id } });
  await writeLog(u.id, "DOC_DELETE", req.params.id);
  res.json({ ok: true });
});

export default router;
