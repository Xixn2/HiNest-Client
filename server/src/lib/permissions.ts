import { prisma } from "./db.js";

/**
 * 역할(role) 별 기능 권한 — 카탈로그(코드) + 오버라이드(DB).
 *
 * 카탈로그의 \`defaults\` 가 출고 시 기본값. 관리자가 SuperAdmin 페이지에서
 * 켜고 끄면 \`RolePermission\` row 가 생성/갱신되어 default 를 덮어쓴다.
 *
 * 사용:
 *   import { hasPermission } from "../lib/permissions.js";
 *   if (!(await hasPermission(u.role, "meeting.delete.any"))) return res.status(403)...
 */

export type Role = "ADMIN" | "MANAGER" | "MEMBER";

export type PermKey =
  | "meeting.create"
  | "meeting.delete.any"
  | "notice.create"
  | "notice.delete.any"
  | "approval.review"
  | "expense.create"
  | "expense.approve"
  | "document.delete.any"
  | "user.invite"
  | "user.edit"
  | "chat.audit"
  | "project.create";

type Catalog = {
  key: PermKey;
  label: string;
  group: "회의록" | "공지" | "결재" | "지출" | "문서" | "사용자" | "기타";
  defaults: Record<Role, boolean>;
};

export const PERMISSION_CATALOG: Catalog[] = [
  // 회의록
  { key: "meeting.create",      label: "회의록 작성",          group: "회의록", defaults: { ADMIN: true,  MANAGER: true,  MEMBER: true  } },
  { key: "meeting.delete.any",  label: "다른 사람 회의록 삭제", group: "회의록", defaults: { ADMIN: true,  MANAGER: false, MEMBER: false } },
  // 공지
  { key: "notice.create",       label: "공지 작성",            group: "공지",   defaults: { ADMIN: true,  MANAGER: true,  MEMBER: false } },
  { key: "notice.delete.any",   label: "다른 사람 공지 삭제",   group: "공지",   defaults: { ADMIN: true,  MANAGER: false, MEMBER: false } },
  // 결재
  { key: "approval.review",     label: "결재자 지정 가능",      group: "결재",   defaults: { ADMIN: true,  MANAGER: true,  MEMBER: false } },
  // 지출
  { key: "expense.create",      label: "지출 등록",            group: "지출",   defaults: { ADMIN: true,  MANAGER: true,  MEMBER: true  } },
  { key: "expense.approve",     label: "지출 승인",            group: "지출",   defaults: { ADMIN: true,  MANAGER: true,  MEMBER: false } },
  // 문서
  { key: "document.delete.any", label: "다른 사람 문서 삭제",   group: "문서",   defaults: { ADMIN: true,  MANAGER: false, MEMBER: false } },
  // 사용자
  { key: "user.invite",         label: "초대 키 발급",          group: "사용자", defaults: { ADMIN: true,  MANAGER: false, MEMBER: false } },
  { key: "user.edit",           label: "사용자 정보 편집",      group: "사용자", defaults: { ADMIN: true,  MANAGER: false, MEMBER: false } },
  // 기타
  { key: "chat.audit",          label: "사내톡 감사 접근",      group: "기타",   defaults: { ADMIN: false, MANAGER: false, MEMBER: false } }, // 개발자 전용
  { key: "project.create",      label: "프로젝트 생성",         group: "기타",   defaults: { ADMIN: true,  MANAGER: true,  MEMBER: true  } },
];

const ALL_KEYS = new Set(PERMISSION_CATALOG.map((p) => p.key));

/* 인메모리 캐시 — 60s. RolePermission row 가 바뀌면 evictPermissionCache(). */
let _cache: { rows: { role: string; permKey: string; enabled: boolean }[]; exp: number } | null = null;
const TTL = 60_000;

async function getOverrides() {
  if (_cache && _cache.exp > Date.now()) return _cache.rows;
  const rows = await prisma.rolePermission.findMany({
    select: { role: true, permKey: true, enabled: true },
  });
  _cache = { rows, exp: Date.now() + TTL };
  return rows;
}

export function evictPermissionCache() { _cache = null; }

/** role 의 특정 권한 활성 여부. row 가 없으면 catalog default. */
export async function hasPermission(role: string, key: PermKey): Promise<boolean> {
  if (!ALL_KEYS.has(key)) return false;
  const r = role as Role;
  const overrides = await getOverrides();
  const found = overrides.find((o) => o.role === r && o.permKey === key);
  if (found) return found.enabled;
  const cat = PERMISSION_CATALOG.find((c) => c.key === key);
  return cat?.defaults[r] ?? false;
}

/** 모든 role × key 에 대한 현재 effective 매트릭스 — 관리 화면이 한 번에 표시할 때. */
export async function getEffectiveMatrix(): Promise<Record<Role, Record<PermKey, boolean>>> {
  const overrides = await getOverrides();
  const out: any = { ADMIN: {}, MANAGER: {}, MEMBER: {} };
  for (const c of PERMISSION_CATALOG) {
    for (const r of ["ADMIN", "MANAGER", "MEMBER"] as const) {
      const ov = overrides.find((o) => o.role === r && o.permKey === c.key);
      out[r][c.key] = ov ? ov.enabled : c.defaults[r];
    }
  }
  return out;
}
