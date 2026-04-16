import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, writeLog } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// 내가 속한 방
router.get("/rooms", async (req, res) => {
  const u = (req as any).user;
  const rooms = await prisma.chatRoom.findMany({
    where: { members: { some: { userId: u.id } } },
    orderBy: { createdAt: "desc" },
    include: {
      members: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  res.json({ rooms });
});

// 방 생성
const roomSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["GROUP", "DIRECT", "TEAM"]).default("GROUP"),
  memberIds: z.array(z.string()).min(1),
});

router.post("/rooms", async (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const d = parsed.data;
  const memberIds = Array.from(new Set([u.id, ...d.memberIds]));
  const room = await prisma.chatRoom.create({
    data: {
      name: d.name,
      type: d.type,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
    include: { members: true },
  });
  await writeLog(u.id, "ROOM_CREATE", room.id, d.name);
  res.json({ room });
});

// 메시지 조회
router.get("/rooms/:id/messages", async (req, res) => {
  const u = (req as any).user;
  const member = await prisma.roomMember.findFirst({
    where: { roomId: req.params.id, userId: u.id },
  });
  if (!member) return res.status(403).json({ error: "forbidden" });
  const afterId = req.query.after ? String(req.query.after) : undefined;
  const where: any = { roomId: req.params.id };
  if (afterId) {
    const after = await prisma.chatMessage.findUnique({ where: { id: afterId } });
    if (after) where.createdAt = { gt: after.createdAt };
  }
  const messages = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { sender: { select: { id: true, name: true, avatarColor: true } } },
  });
  res.json({ messages });
});

// 메시지 전송
router.post("/rooms/:id/messages", async (req, res) => {
  const u = (req as any).user;
  const content = String(req.body?.content ?? "").trim();
  if (!content) return res.status(400).json({ error: "empty" });
  const member = await prisma.roomMember.findFirst({
    where: { roomId: req.params.id, userId: u.id },
  });
  if (!member) return res.status(403).json({ error: "forbidden" });
  const msg = await prisma.chatMessage.create({
    data: { roomId: req.params.id, senderId: u.id, content },
    include: { sender: { select: { id: true, name: true, avatarColor: true } } },
  });
  res.json({ message: msg });
});

export default router;
