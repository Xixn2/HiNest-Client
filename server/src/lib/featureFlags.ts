import { prisma } from "./db.js";

/**
 * 기능 플래그 평가기 — 사용자 컨텍스트에 따라 key → boolean 으로 해석.
 * 60초 인메모리 캐시로 매 요청마다 DB 안 침. 변경 시 evictCache() 로 즉시 무효화.
 */

type Flag = { key: string; enabled: boolean; scope: string; targets: string | null };

let _cache: { rows: Flag[]; exp: number } | null = null;
const TTL_MS = 60_000;

async function getAllFlags(): Promise<Flag[]> {
  if (_cache && _cache.exp > Date.now()) return _cache.rows;
  const rows = await prisma.featureFlag.findMany({
    select: { key: true, enabled: true, scope: true, targets: true },
  });
  _cache = { rows, exp: Date.now() + TTL_MS };
  return rows;
}

export function evictFlagCache() {
  _cache = null;
}

export type UserCtx = {
  id: string;
  role: string;
  team: string | null;
};

/** 단일 플래그가 사용자 컨텍스트 기준으로 켜져있는지. row 가 없으면 기본 false. */
export async function isFlagEnabled(key: string, u: UserCtx): Promise<boolean> {
  const rows = await getAllFlags();
  const row = rows.find((r) => r.key === key);
  if (!row || !row.enabled) return false;
  return matchesScope(row, u);
}

/** 사용자 컨텍스트 기준으로 켜져있는 플래그 키들의 맵. */
export async function resolveFlags(u: UserCtx): Promise<Record<string, boolean>> {
  const rows = await getAllFlags();
  const out: Record<string, boolean> = {};
  for (const r of rows) {
    out[r.key] = r.enabled && matchesScope(r, u);
  }
  return out;
}

function matchesScope(row: Flag, u: UserCtx): boolean {
  const targets = (row.targets ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  switch (row.scope) {
    case "GLOBAL": return true;
    case "ROLE":   return targets.includes(u.role);
    case "USER":   return targets.includes(u.id);
    case "TEAM":   return !!u.team && targets.includes(u.team);
    default:        return false;
  }
}
