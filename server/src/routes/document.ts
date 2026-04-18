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
});

router.get("/", async (req, res) => {
  const folderId = req.query.folderId ? String(req.query.folderId) : undefined;
  const q = req.query.q ? String(req.query.q).trim() : "";
  const where: any = {};
  if (folderId === "root") where.folderId = null;
  else if (folderId) where.folderId = folderId;
  if (q) where.OR = [
    { title: { contains: q } },
    { description: { contains: q } },
    { tags: { contains: q } },
  ];
  const docs = await prisma.document.findMany({
    where,
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
