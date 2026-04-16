import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { prisma } from "../lib/db.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const u = (req as any).user;
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  if (!user) return res.status(404).json({ error: "not found" });
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      team: user.team,
      position: user.position,
      avatarColor: user.avatarColor,
    },
  });
});

export default router;
