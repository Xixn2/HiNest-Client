import { Router } from "express";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

// 팀원 목록 (일반 유저도 볼 수 있음)
router.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      team: true,
      position: true,
      avatarColor: true,
    },
  });
  res.json({ users });
});

// 팀 목록
router.get("/teams", async (_req, res) => {
  const rows = await prisma.user.findMany({
    where: { team: { not: null }, active: true },
    select: { team: true },
    distinct: ["team"],
  });
  res.json({ teams: rows.map((r) => r.team).filter(Boolean) });
});

export default router;
