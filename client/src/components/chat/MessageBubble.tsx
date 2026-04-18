import { useEffect, useRef } from "react";
import { C, FONT, formatBytes } from "./theme";
import type { Attachment, Message, Reaction } from "./types";

/* ===== 꾹 누르기 감지 래퍼 (터치 + 마우스 + 우클릭) ===== */
export function LongPress({
  children,
  onLongPress,
  delay = 420,
  style,
}: {
  children: React.ReactNode;
  onLongPress: () => void;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const timerRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  const start = (x: number, y: number) => {
    firedRef.current = false;
    startPosRef.current = { x, y };
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  };
  const cancel = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  const moveCheck = (x: number, y: number) => {
    const s = startPosRef.current;
    if (!s) return;
    if (Math.abs(x - s.x) > 8 || Math.abs(y - s.y) > 8) cancel();
  };

  return (
    <div
      onTouchStart={(e) => {
        const t = e.touches[0];
        start(t.clientX, t.clientY);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        moveCheck(t.clientX, t.clientY);
      }}
      onTouchEnd={cancel}
      onTouchCancel={cancel}
      onMouseDown={(e) => {
        if (e.button === 0) start(e.clientX, e.clientY);
      }}
      onMouseMove={(e) => moveCheck(e.clientX, e.clientY)}
      onMouseUp={cancel}
      onMouseLeave={cancel}
      onContextMenu={(e) => {
        // 우클릭도 리액션 메뉴로
        e.preventDefault();
        cancel();
        firedRef.current = true;
        onLongPress();
      }}
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ===== 이모지 픽커 팝오버 ===== */
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
export function ReactionPicker({
  mine,
  onPick,
  onDismiss,
}: {
  mine: boolean;
  onPick: (emoji: string) => void;
  onDismiss: () => void;
}) {
  // 버블 위에 띄움. 바깥 클릭 시 닫기.
  useEffect(() => {
    const onDown = () => onDismiss();
    const t = window.setTimeout(
      () => window.addEventListener("mousedown", onDown),
      0
    );
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onDown);
    };
  }, [onDismiss]);

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        [mine ? "right" : "left"]: 0,
        zIndex: 10,
        background: "#fff",
        border: `1px solid ${C.gray200}`,
        borderRadius: 999,
        padding: "4px 6px",
        display: "flex",
        alignItems: "center",
        gap: 2,
        boxShadow:
          "0 8px 24px rgba(25, 31, 40, .14), 0 2px 6px rgba(25, 31, 40, .06)",
        animation: "hinest-pop .14s cubic-bezier(.22,.61,.36,1)",
      } as React.CSSProperties}
    >
      <style>{`@keyframes hinest-pop {
        from { transform: scale(.85) translateY(4px); opacity: 0; }
        to   { transform: scale(1) translateY(0); opacity: 1; }
      }`}</style>
      {QUICK_EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: "transparent",
            border: 0,
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            display: "grid",
            placeItems: "center",
            transition: "background .12s ease, transform .12s ease",
          }}
          onMouseEnter={(ev) => {
            ev.currentTarget.style.background = C.gray100;
            ev.currentTarget.style.transform = "scale(1.15)";
          }}
          onMouseLeave={(ev) => {
            ev.currentTarget.style.background = "transparent";
            ev.currentTarget.style.transform = "scale(1)";
          }}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** 같은 이모지끼리 그룹핑 + 카운트 + 누구 단건지 이름 배열 */
export function groupReactions(list: Reaction[]) {
  const map = new Map<
    string,
    { emoji: string; count: number; userIds: string[]; names: string[] }
  >();
  for (const r of list) {
    const g = map.get(r.emoji) ?? {
      emoji: r.emoji,
      count: 0,
      userIds: [],
      names: [],
    };
    g.count += 1;
    g.userIds.push(r.userId);
    if (r.user?.name) g.names.push(r.user.name);
    map.set(r.emoji, g);
  }
  return Array.from(map.values());
}

/** 서버가 이미 검증하지만 렌더 단에서 한 번 더 방어 — /uploads/ 경로만 허용 */
export function safeFileUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  return /^\/uploads\/[A-Za-z0-9._-]+$/.test(u) ? u : null;
}

/* ===== 메시지 버블 — 텍스트 / 이미지 / 비디오 / 파일 ===== */
export function MessageBubble({ msg, mine }: { msg: Message; mine: boolean }) {
  const fileUrl = safeFileUrl(msg.fileUrl);
  const hasFile = !!fileUrl;
  const hasText = !!msg.content?.trim();

  // 이미지: 버블 없이 썸네일. 캡션은 아래 작은 버블.
  if (hasFile && msg.kind === "IMAGE") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: mine ? "flex-end" : "flex-start",
          gap: 4,
        }}
      >
        <a
          href={fileUrl!}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            lineHeight: 0,
            borderRadius: 16,
            overflow: "hidden",
            maxWidth: 220,
          }}
        >
          <img
            src={fileUrl!}
            alt={msg.fileName ?? ""}
            style={{
              display: "block",
              maxWidth: 220,
              maxHeight: 220,
              width: "auto",
              height: "auto",
              borderRadius: 16,
            }}
          />
        </a>
        {hasText && <TextBubble content={msg.content} mine={mine} />}
      </div>
    );
  }

  // 비디오: 컨트롤 달린 플레이어.
  if (hasFile && msg.kind === "VIDEO") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: mine ? "flex-end" : "flex-start",
          gap: 4,
        }}
      >
        <video
          src={fileUrl!}
          controls
          style={{
            display: "block",
            maxWidth: 220,
            maxHeight: 220,
            borderRadius: 16,
            background: "#000",
          }}
        />
        {hasText && <TextBubble content={msg.content} mine={mine} />}
      </div>
    );
  }

  // 파일: 다운로드 카드.
  if (hasFile && msg.kind === "FILE") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: mine ? "flex-end" : "flex-start",
          gap: 4,
        }}
      >
        <a
          href={fileUrl!}
          target="_blank"
          rel="noreferrer"
          download={msg.fileName ?? undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 12px",
            background: mine ? C.blue : C.gray100,
            color: mine ? "#fff" : C.ink,
            borderRadius: 14,
            textDecoration: "none",
            maxWidth: 240,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: mine ? "rgba(255,255,255,.2)" : "#fff",
              color: mine ? "#fff" : C.gray700,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {msg.fileName ?? "파일"}
            </div>
            {typeof msg.fileSize === "number" && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  opacity: 0.75,
                  marginTop: 2,
                }}
              >
                {formatBytes(msg.fileSize)}
              </div>
            )}
          </div>
        </a>
        {hasText && <TextBubble content={msg.content} mine={mine} />}
      </div>
    );
  }

  // 기본: 텍스트 버블
  return <TextBubble content={msg.content} mine={mine} />;
}

export function TextBubble({
  content,
  mine,
}: {
  content: string;
  mine: boolean;
}) {
  return (
    <div
      style={{
        padding: "9px 13px",
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1.4,
        letterSpacing: "-0.01em",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        color: mine ? "#fff" : C.ink,
        background: mine ? C.blue : C.gray100,
        borderRadius: 16,
        fontFamily: FONT,
      }}
    >
      {content}
    </div>
  );
}

/* ===== 첨부 미리보기 (전송 전 입력바 위) ===== */
export function AttachmentPreview({
  att,
  onClear,
}: {
  att: Attachment;
  onClear: () => void;
}) {
  const common = {
    position: "relative" as const,
    display: "inline-flex",
    borderRadius: 14,
    overflow: "hidden",
    background: C.gray100,
    border: `1px solid ${C.gray200}`,
  };

  let body: React.ReactNode;
  if (att.kind === "IMAGE") {
    body = (
      <img
        src={att.url}
        alt={att.name}
        style={{ display: "block", width: 72, height: 72, objectFit: "cover" }}
      />
    );
  } else if (att.kind === "VIDEO") {
    body = (
      <div
        style={{
          width: 180,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "#111",
            color: "#fff",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {att.name}
          </div>
          <div style={{ fontSize: 11, color: C.gray600, marginTop: 2 }}>
            {formatBytes(att.size)}
          </div>
        </div>
      </div>
    );
  } else {
    body = (
      <div
        style={{
          width: 180,
          padding: "10px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "#fff",
            color: C.gray700,
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
            border: `1px solid ${C.gray200}`,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: C.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {att.name}
          </div>
          <div style={{ fontSize: 11, color: C.gray600, marginTop: 2 }}>
            {formatBytes(att.size)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={common}>
      {body}
      <button
        type="button"
        onClick={onClear}
        title="첨부 제거"
        aria-label="첨부 제거"
        style={{
          position: "absolute",
          top: 4,
          right: 4,
          width: 22,
          height: 22,
          borderRadius: 999,
          background: "rgba(0,0,0,.55)",
          color: "#fff",
          border: 0,
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
