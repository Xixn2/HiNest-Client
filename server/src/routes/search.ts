import { Router } from "express";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

/**
 * 글로벌 검색. 결과는 섹션별로 묶어서 반환.
 * - people : 유저 (총관리자는 제외)
 * - notices
 * - events (내가 볼 수 있는)
 * - documents
 * - messages (내가 멤버인 방만)
 */
router.get("/", async (req, res) => {
  const u = (req as any).user;
  const q = String(req.query.q ?? "").trim();
  if (q.length < 1) return res.json({ q, results: {} });

  const meUser = await prisma.user.findUnique({ where: { id: u.id } });

  const [people, notices, events, documents, messages] = await Promise.all([
    prisma.user.findMany({
      where: {
        active: true,
        OR: [{ superAdmin: false }, { id: u.id }],
        AND: [
          {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { team: { contains: q } },
              { position: { contains: q } },
            ],
          },
        ],
      },
      take: 8,
      select: { id: true, name: true, email: true, team: true, position: true, avatarColor: true },
    }),
    prisma.notice.findMany({
      where: {
        OR: [{ title: { contains: q } }, { content: { contains: q } }],
      },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true } } },
    }),
    prisma.event.findMany({
      where: {
        AND: [
          {
            OR: [
              { scope: "COMPANY" },
              { scope: "TEAM", team: meUser?.team ?? "" },
              { scope: "PERSONAL", createdBy: u.id },
            ],
          },
          {
            OR: [{ title: { contains: q } }, { content: { contains: q } }],
          },
        ],
      },
      take: 8,
      orderBy: { startAt: "desc" },
    }),
    prisma.document.findMany({
      where: {
        OR: [{ title: { contains: q } }, { description: { contains: q } }, { tags: { contains: q } }],
      },
      take: 8,
      orderBy: { updatedAt: "desc" },
      include: { author: { select: { name: true } }, folder: { select: { name: true } } },
    }),
    prisma.chatMessage.findMany({
      where: {
        deletedAt: null,
        room: { members: { some: { userId: u.id } } },
        content: { contains: q },
      },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        sender: { select: { name: true, avatarColor: true } },
        room: { select: { id: true, name: true, type: true } },
      },
    }),
  ]);

  res.json({
    q,
    results: { people, notices, events, documents, messages },
  });
});

export default router;
