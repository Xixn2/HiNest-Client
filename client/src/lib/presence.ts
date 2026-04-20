/**
 * 업무 상태 표시 유틸리티.
 * 수동 상태(presenceStatus) 가 있으면 그걸 우선, 없으면 출퇴근(workStatus) 기준으로 자동 판정.
 */

export type PresenceStatus = "AVAILABLE" | "MEETING" | "MEAL" | "OUT" | "AWAY" | "OFFLINE";
export type WorkStatus = "IN" | "OFF" | "NONE" | "LEAVE" | "HALF_LEAVE" | "TRIP";

export type PresenceInfo = {
  key: PresenceStatus | WorkStatus;
  label: string;
  color: string; // 점 색
  tone: "green" | "amber" | "gray" | "blue" | "purple" | "red";
};

const MAP: Record<string, PresenceInfo> = {
  AVAILABLE: { key: "AVAILABLE", label: "근무중", color: "#16A34A", tone: "green" },
  MEETING:   { key: "MEETING",   label: "회의중", color: "#7C3AED", tone: "purple" },
  MEAL:      { key: "MEAL",      label: "식사",   color: "#D97706", tone: "amber" },
  OUT:       { key: "OUT",       label: "외출",   color: "#0EA5E9", tone: "blue" },
  AWAY:      { key: "AWAY",      label: "자리비움", color: "#CA8A04", tone: "amber" },
  OFFLINE:   { key: "OFFLINE",   label: "오프라인", color: "#8E959E", tone: "gray" },
  IN:        { key: "IN",        label: "출근",   color: "#16A34A", tone: "green" },
  OFF:       { key: "OFF",       label: "퇴근",   color: "#8E959E", tone: "gray" },
  NONE:      { key: "NONE",      label: "미출근", color: "#D97706", tone: "amber" },
  LEAVE:      { key: "LEAVE",      label: "휴가",   color: "#7C3AED", tone: "purple" },
  HALF_LEAVE: { key: "HALF_LEAVE", label: "반차",   color: "#D97706", tone: "amber" },
  TRIP:       { key: "TRIP",       label: "외근",   color: "#0EA5E9", tone: "blue" },
};

export function resolvePresence(
  presenceStatus: PresenceStatus | null | undefined,
  workStatus: WorkStatus | null | undefined,
): PresenceInfo {
  if (presenceStatus && MAP[presenceStatus]) return MAP[presenceStatus];
  if (workStatus && MAP[workStatus]) return MAP[workStatus];
  return MAP.NONE;
}

// 근무중 / 오프라인은 자동 (출퇴근 기준) 으로만 노출 — 수동 선택 불가.
// 회의중 · 식사 · 외출 · 자리비움만 수동 설정 가능, 그 외는 "자동" 으로 돌려놓음.
export const PRESENCE_CHOICES: { value: PresenceStatus | null; label: string; emoji: string }[] = [
  { value: null,        label: "자동 (출근 기준)", emoji: "🔄" },
  { value: "MEETING",   label: "회의중",         emoji: "💼" },
  { value: "MEAL",      label: "식사",           emoji: "🍽️" },
  { value: "OUT",       label: "외출",           emoji: "🚶" },
  { value: "AWAY",      label: "자리비움",       emoji: "💤" },
];
