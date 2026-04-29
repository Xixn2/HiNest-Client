import { Router } from "express";
import { requireAuth } from "../lib/auth.js";
import { resolveFlags } from "../lib/featureFlags.js";

const router = Router();

/** 현재 사용자 기준으로 켜져있는 플래그 맵. 클라가 부트 시 1번 호출. */
router.get("/", requireAuth, async (req, res) => {
  const u = (req as any).userRecord;
  const flags = await resolveFlags({ id: u.id, role: u.role, team: u.team ?? null });
  res.setHeader("Cache-Control", "private, max-age=60");
  res.json({ flags });
});

export default router;
