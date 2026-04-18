/**
 * 토스(Toss) 스타일 채팅 UI 테마 상수 + 범용 포맷/정렬 헬퍼.
 * ChatMiniApp 분할 과정에서 중복 유틸을 모아둠.
 */
import type { Room } from "./types";

export const C = {
  blue: "#3182F6",
  blueHover: "#1B64DA",
  blueSoft: "#E8F3FF",
  ink: "#191F28",
  gray700: "#4E5968",
  gray600: "#6B7684",
  gray500: "#8B95A1",
  gray300: "#D1D6DB",
  gray200: "#E5E8EB",
  gray100: "#F2F4F6",
  red: "#F04452",
} as const;

export const FONT =
  "Pretendard, 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', system-ui, sans-serif";

/** 방 이름 — DIRECT 는 상대방 이름, 그 외는 room.name 폴백 */
export function roomTitle(r: Room, meId: string): string {
  if (r.type === "DIRECT") {
    const other = r.members.find((m) => m.user.id !== meId)?.user;
    return other?.name ?? r.name ?? "대화";
  }
  return r.name || (r.type === "TEAM" ? "팀 채팅" : "그룹");
}

/** 방 아바타 색 — DIRECT 는 상대방 색, 그 외는 타입별 기본 */
export function roomColor(r: Room, meId: string): string {
  if (r.type === "DIRECT") {
    const other = r.members.find((m) => m.user.id !== meId)?.user;
    return other?.avatarColor ?? C.blue;
  }
  return r.type === "TEAM" ? "#00C4B4" : "#4E5968";
}

/** 리스트 미리보기 텍스트 — 첨부는 종류 라벨, 없으면 content */
export function previewForMessage(m: {
  content?: string;
  kind?: string;
  fileName?: string | null;
}): string {
  if (m.kind === "IMAGE") return "📷 사진";
  if (m.kind === "VIDEO") return "🎬 동영상";
  if (m.kind === "FILE") return "📎 파일 첨부";
  return m.content ?? "";
}

/** 바이트 → 사람이 읽기 쉬운 크기 */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

/** 상대 시각 — "방금", "N분 전", "N시간 전", "N일 전", 주말 넘어가면 MM/DD */
export function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "방금";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}일 전`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 이름 첫 글자 기반 원형 아바타 */
export function Avatar({
  name,
  color,
  size,
}: {
  name: string;
  color: string;
  size: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        display: "grid",
        placeItems: "center",
        fontSize: size * 0.42,
        fontWeight: 700,
        flexShrink: 0,
        letterSpacing: "-0.02em",
      }}
    >
      {name?.[0] ?? "?"}
    </div>
  );
}

/* ===== 방별 로컬 설정(별명/음소거) localStorage 저장 ===== */
const ROOM_SETTINGS_KEY = "hinest.chat.roomSettings.v1";

export function loadAllRoomSettings(): Record<string, { nickname?: string; muted?: boolean }> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ROOM_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAllRoomSettings(
  map: Record<string, { nickname?: string; muted?: boolean }>
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ROOM_SETTINGS_KEY, JSON.stringify(map));
  } catch {}
}
