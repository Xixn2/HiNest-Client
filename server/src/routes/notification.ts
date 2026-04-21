import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";
import { addClient, removeClient } from "../lib/sse.js";

const router = Router();

/* ===== Server-Sent Events 스트림 (인증 쿠키 사용) ===== */
router.get("/stream", requireAuth, async (req, res) => {
  const u = (req as any).user;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  (res as any).flushHeaders?.();

  res.write(`event: ready\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);

  const client = addClient(u.id, res);

  // 15초마다 keepalive 주석 라인 (프록시·브라우저 idle 타임아웃 방지)
  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {}
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(client);
  });
});

router.use(requireAuth);

router.get("/", async (req, res) => {
  const u = (req as any).user;
  const scope = String(req.query.scope ?? "all"); // all | unread
  const where: any = { userId: u.id };
  if (scope === "unread") where.readAt = null;
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.notification.count({ where: { userId: u.id, readAt: null } }),
  ]);
  res.json({ notifications: items, unread });
});

const readSchema = z.object({
  // 한 번에 500 건까지만 읽음 처리 — IN() 폭주 방지.
  ids: z.array(z.string().max(64)).max(500).optional(),
  all: z.boolean().optional(),
});

router.post("/read", async (req, res) => {
  const u = (req as any).user;
  const parsed = readSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const { ids, all } = parsed.data;
  if (all) {
    await prisma.notification.updateMany({
      where: { userId: u.id, readAt: null },
      data: { readAt: new Date() },
    });
  } else if (ids && ids.length) {
    await prisma.notification.updateMany({
      where: { userId: u.id, id: { in: ids }, readAt: null },
      data: { readAt: new Date() },
    });
  }
  const unread = await prisma.notification.count({
    where: { userId: u.id, readAt: null },
  });
  res.json({ ok: true, unread });
});

router.delete("/:id", async (req, res) => {
  const u = (req as any).user;
  await prisma.notification.deleteMany({
    where: { id: req.params.id, userId: u.id },
  });
  res.json({ ok: true });
});

export default router;
