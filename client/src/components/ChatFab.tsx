import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useNotifications } from "../notifications";
import ChatMiniApp from "./ChatMiniApp";

/**
 * 우하단 플로팅 채팅 버튼 — 토스(Toss) 스타일 팝업.
 *
 * 헤더는 상황에 따라 2가지:
 *  1) 목록 화면: "사내톡" + "안 읽은 메시지 N개 / 모든 메시지를 확인했어요"
 *  2) 대화방 화면: ← 뒤로 + 아바타 + 방 이름 + 서브텍스트
 */

const C = {
  blue: "#3182F6",
  blueHover: "#1B64DA",
  ink: "#191F28",
  gray700: "#4E5968",
  gray600: "#6B7684",
  gray500: "#8B95A1",
  gray100: "#F2F4F6",
  red: "#F04452",
};
const FONT =
  "Pretendard, 'Pretendard Variable', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', system-ui, sans-serif";

type ActiveRoomInfo = {
  title: string;
  subtitle: string;
  color: string;
  onBack: () => void;
  onTitleClick?: () => void;
  isSettings?: boolean;
};

export default function ChatFab() {
  const loc = useLocation();
  const { chatUnread } = useNotifications();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeRoom, setActiveRoom] = useState<ActiveRoomInfo | null>(null);
  const [createReq, setCreateReq] = useState(0);

  const hidden =
    loc.pathname.startsWith("/chat") ||
    loc.pathname.startsWith("/login") ||
    loc.pathname.startsWith("/signup");

  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // 팝업 닫힐 때 방 상태도 초기화
  useEffect(() => { if (!open) setActiveRoom(null); }, [open]);

  if (hidden) return null;

  const toggle = () => setOpen((s) => { const n = !s; if (n) setMounted(true); return n; });

  return (
    <>
      {mounted && (
        <div
          className={`fixed z-40 ${
            open
              ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
              : "opacity-0 translate-y-3 scale-[.98] pointer-events-none"
          }`}
          style={{
            right: 28,
            bottom: 108,
            width: 380,
            height: 580,
            maxHeight: "calc(100vh - 140px)",
            transformOrigin: "bottom right",
            borderRadius: 20,
            overflow: "hidden",
            background: "#fff",
            fontFamily: FONT,
            color: C.ink,
            letterSpacing: "-0.015em",
            boxShadow:
              "0 20px 50px rgba(25, 31, 40, .14), 0 4px 12px rgba(25, 31, 40, .06)",
            transition:
              "opacity .28s cubic-bezier(.22,.61,.36,1), transform .32s cubic-bezier(.22,.61,.36,1)",
          }}
        >
          {/* ===== 헤더 ===== */}
          {activeRoom ? (
            <RoomHeader info={activeRoom} />
          ) : (
            <ListHeader chatUnread={chatUnread} onCreateGroup={() => setCreateReq((n) => n + 1)} />
          )}

          {/* ===== 본문 — 설정 화면에서는 헤더가 얇아지므로 top을 50으로 올림 ===== */}
          <div
            style={{
              position: "absolute",
              top: activeRoom?.isSettings ? 50 : 86,
              bottom: 0, left: 0, right: 0,
              background: "#fff",
            }}
          >
            <ChatMiniApp active={open} onActiveRoomChange={setActiveRoom} createGroupRequestId={createReq} />
          </div>
        </div>
      )}

      {/* ===== FAB ===== */}
      <button
        type="button"
        onClick={toggle}
        title={open ? "사내톡 닫기" : "사내톡 열기"}
        aria-label={chatUnread > 0 ? `사내톡 · 안 읽은 메시지 ${chatUnread}건` : "사내톡"}
        aria-expanded={open}
        className="fixed z-40 flex items-center justify-center active:scale-[.94]"
        style={{
          right: 28, bottom: 28, width: 60, height: 60,
          borderRadius: 999,
          background: C.blue, color: "#fff",
          border: 0, cursor: "pointer",
          boxShadow:
            "0 10px 24px rgba(49, 130, 246, .36), 0 2px 6px rgba(49, 130, 246, .20)",
          transition:
            "background .18s ease, transform .18s cubic-bezier(.22,.61,.36,1)",
          transform: open ? "scale(.96)" : undefined,
          fontFamily: FONT,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = C.blueHover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = C.blue)}
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        )}

        {chatUnread > 0 && !open && (
          <span
            style={{
              position: "absolute",
              top: -2, right: -2,
              minWidth: 22, height: 22, padding: "0 6px",
              borderRadius: 999,
              background: C.red, color: "#fff",
              fontSize: 11, fontWeight: 700,
              display: "grid", placeItems: "center",
              boxShadow: "0 0 0 2px #fff",
              fontFamily: FONT,
              letterSpacing: "-0.01em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {chatUnread > 99 ? "99+" : chatUnread}
          </span>
        )}
      </button>
    </>
  );
}

/* ===== 목록용 헤더 ===== */
function ListHeader({ chatUnread, onCreateGroup }: { chatUnread: number; onCreateGroup: () => void }) {
  return (
    <div
      style={{
        padding: "22px 22px 14px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        background: "#fff",
      }}
    >
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
          사내톡
        </div>
        <div style={{ marginTop: 4, fontSize: 13, fontWeight: 500, color: C.gray600, letterSpacing: "-0.01em" }}>
          {chatUnread > 0 ? `안 읽은 메시지 ${chatUnread}개` : "모든 메시지를 확인했어요"}
        </div>
      </div>

      <button
        onClick={onCreateGroup}
        title="새 그룹 만들기"
        aria-label="새 그룹 만들기"
        style={{
          width: 38, height: 38, borderRadius: 999,
          background: C.gray100, color: C.ink,
          border: 0, cursor: "pointer",
          display: "grid", placeItems: "center",
          flexShrink: 0,
          transition: "background .15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#E8EBEE")}
        onMouseLeave={(e) => (e.currentTarget.style.background = C.gray100)}
      >
        {/* 사람 + 플러스 */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
      </button>
    </div>
  );
}

/* ===== 대화방용 헤더 ===== */
function RoomHeader({ info }: { info: ActiveRoomInfo }) {
  // 설정 화면에서는 제목/닫기 없이 얇은 뒤로가기 바만 표시
  if (info.isSettings) {
    return (
      <div
        style={{
          padding: "12px 14px 4px",
          display: "flex", alignItems: "center",
          background: "#fff",
        }}
      >
        <button
          onClick={info.onBack}
          title="뒤로"
          style={{
            width: 34, height: 34, borderRadius: 999,
            background: C.gray100, color: C.ink,
            border: 0, cursor: "pointer",
            display: "grid", placeItems: "center",
            transition: "background .12s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#E8EBEE")}
          onMouseLeave={(e) => (e.currentTarget.style.background = C.gray100)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "18px 18px 12px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#fff",
      }}
    >
      <button
        onClick={info.onBack}
        title="뒤로"
        style={{
          width: 34, height: 34, borderRadius: 999,
          background: C.gray100, color: C.ink,
          border: 0, cursor: "pointer",
          display: "grid", placeItems: "center",
          flexShrink: 0,
          transition: "background .12s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#E8EBEE")}
        onMouseLeave={(e) => (e.currentTarget.style.background = C.gray100)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      <button
        onClick={info.onTitleClick}
        disabled={!info.onTitleClick}
        title={info.onTitleClick ? "채팅방 설정" : undefined}
        style={{
          flex: 1, minWidth: 0,
          display: "flex", alignItems: "center", gap: 10,
          padding: "6px 8px", marginLeft: -8,
          borderRadius: 10,
          background: "transparent",
          border: 0,
          cursor: info.onTitleClick ? "pointer" : "default",
          textAlign: "left",
          transition: "background .12s ease",
        }}
        onMouseEnter={(e) => { if (info.onTitleClick) e.currentTarget.style.background = C.gray100; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <div
          style={{
            width: 38, height: 38, borderRadius: "50%",
            background: info.color, color: "#fff",
            display: "grid", placeItems: "center",
            fontSize: 15, fontWeight: 700, flexShrink: 0,
            letterSpacing: "-0.02em",
          }}
        >
          {info.title?.[0] ?? "?"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 16, fontWeight: 700, color: C.ink,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              lineHeight: 1.2,
            }}
          >
            {info.title}
          </div>
          <div style={{ marginTop: 2, fontSize: 12, fontWeight: 500, color: C.gray600 }}>
            {info.subtitle}
          </div>
        </div>
      </button>
    </div>
  );
}

