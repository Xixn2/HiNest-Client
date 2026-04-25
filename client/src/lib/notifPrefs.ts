/**
 * 카테고리별 데스크톱 알림 ON/OFF + 채팅방 음소거 존중.
 *
 * 기존 구조:
 *  - lib/desktopNotify.ts 가 OS 알림 발송 + 마스터 ON/OFF (LS_ENABLED)
 *  - notifications.tsx 가 SSE/poll 로 받은 알림을 deliverPendingNotifications 로 위임
 *  - components/chat/theme.tsx 가 방별 muted 플래그를 hinest.chat.roomSettings.v1 에 저장
 *
 * 이번 변경의 목적:
 *  1) 카테고리별(공지/DM/멘션/결재/시스템) 토글 — 마이페이지에서 세분화 설정 가능.
 *  2) 채팅방 알림 끔 토글이 OS 알림에도 반영되도록 — 종전엔 미읽음 뱃지만 가렸음.
 */

import type { NotifType } from "../notifications";

const LS_PREFS = "hinest.notif.prefs.v1";
const ROOM_SETTINGS_KEY = "hinest.chat.roomSettings.v1"; // chat/theme.tsx 와 동일 키

/** 사용자에게 노출할 카테고리. NotifType 보다 묶음 단위 — APPROVAL_* 두 개를 한 토글로. */
export type NotifCategory = "NOTICE" | "CHAT" | "MENTION" | "APPROVAL" | "SYSTEM";

export const NOTIF_CATEGORIES: { key: NotifCategory; label: string; desc: string }[] = [
  { key: "NOTICE", label: "공지사항", desc: "사내 공지 / 일정 / 회의록 알림" },
  { key: "CHAT", label: "사내톡 메시지", desc: "DM 및 그룹 대화의 새 메시지" },
  { key: "MENTION", label: "@멘션", desc: "사내톡·문서에서 나를 호출했을 때" },
  { key: "APPROVAL", label: "결재", desc: "결재 요청/검토 알림" },
  { key: "SYSTEM", label: "시스템", desc: "관리자·시스템에서 보내는 알림" },
];

export type NotifPrefs = Record<NotifCategory, boolean>;

const DEFAULT_PREFS: NotifPrefs = {
  NOTICE: true,
  CHAT: true,
  MENTION: true,
  APPROVAL: true,
  SYSTEM: true,
};

/** NotifType → 사용자 카테고리 매핑. */
function categoryOf(type: NotifType): NotifCategory {
  if (type === "DM") return "CHAT";
  if (type === "MENTION") return "MENTION";
  if (type === "APPROVAL_REQUEST" || type === "APPROVAL_REVIEW") return "APPROVAL";
  if (type === "NOTICE") return "NOTICE";
  return "SYSTEM";
}

export function loadPrefs(): NotifPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(LS_PREFS);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    // DEFAULT 와 머지 — 새 카테고리 추가 시 기본값 ON 으로 보강.
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: NotifPrefs) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_PREFS, JSON.stringify(p));
    // 다른 탭/컴포넌트가 즉시 반영하도록 이벤트.
    window.dispatchEvent(new CustomEvent("hinest:notifPrefsChange"));
  } catch {}
}

export function setCategoryEnabled(cat: NotifCategory, on: boolean) {
  const cur = loadPrefs();
  cur[cat] = on;
  savePrefs(cur);
}

/** linkUrl 에서 ?room=<id> 파싱 — DM/MENTION 알림은 항상 이 패턴. */
function roomIdFromLinkUrl(linkUrl?: string | null): string | null {
  if (!linkUrl) return null;
  const m = /[?&#]room=([^&]+)/.exec(linkUrl);
  return m ? decodeURIComponent(m[1]) : null;
}

function isRoomMuted(roomId: string): boolean {
  try {
    const raw = localStorage.getItem(ROOM_SETTINGS_KEY);
    if (!raw) return false;
    const map = JSON.parse(raw) as Record<string, { muted?: boolean }>;
    return !!map?.[roomId]?.muted;
  } catch {
    return false;
  }
}

/**
 * 알림 1건이 데스크톱 OS 알림으로 떠야 하는지 판정.
 * - 카테고리 토글이 꺼져있으면 false
 * - 채팅 카테고리(CHAT/MENTION)면서 해당 방이 음소거면 false
 *
 * 마스터 토글(isDesktopEnabled)·권한 체크는 desktopNotify.showDesktopNotification 안에서 수행.
 */
export function shouldDeliverNotif(n: { type: NotifType; linkUrl?: string | null }): boolean {
  const prefs = loadPrefs();
  const cat = categoryOf(n.type);
  if (!prefs[cat]) return false;
  if (cat === "CHAT" || cat === "MENTION") {
    const roomId = roomIdFromLinkUrl(n.linkUrl);
    if (roomId && isRoomMuted(roomId)) return false;
  }
  return true;
}
