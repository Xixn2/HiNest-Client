import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
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
      // 롱프레스가 발동된 직후 따라오는 click 은 자식(이미지 뷰어 등)으로 내려가지 않게 차단
      onClickCapture={(e) => {
        if (firedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          firedRef.current = false;
        }
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

/* ===== 이미지 썸네일 + 라이트박스 (뷰포트 안에 contain) ===== */
function ImageThumb({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        style={{
          display: "block",
          lineHeight: 0,
          borderRadius: 16,
          overflow: "hidden",
          maxWidth: 140,
          border: 0,
          padding: 0,
          background: "transparent",
          cursor: "zoom-in",
        }}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          style={{
            display: "block",
            maxWidth: 140,
            maxHeight: 160,
            width: "auto",
            height: "auto",
            borderRadius: 16,
          }}
        />
      </button>
      {open && <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, .82)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        animation: "hinest-fade .12s ease",
      }}
    >
      <style>{`@keyframes hinest-fade { from { opacity: 0 } to { opacity: 1 } }`}</style>
      <img
        src={src}
        alt={alt}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          maxWidth: "min(92vw, 1200px)",
          maxHeight: "90vh",
          width: "auto",
          height: "auto",
          objectFit: "contain",
          borderRadius: 8,
          boxShadow: "0 16px 48px rgba(0,0,0,.4)",
        }}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: 999,
          background: "rgba(255,255,255,.12)",
          border: 0,
          color: "#fff",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          backdropFilter: "blur(8px)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
      <a
        href={src}
        download={alt || undefined}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label="다운로드"
        style={{
          position: "absolute",
          top: 16,
          right: 64,
          width: 40,
          height: 40,
          borderRadius: 999,
          background: "rgba(255,255,255,.12)",
          color: "#fff",
          textDecoration: "none",
          display: "grid",
          placeItems: "center",
          backdropFilter: "blur(8px)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <path d="M7 10l5 5 5-5" />
          <path d="M12 15V3" />
        </svg>
      </a>
    </div>
  );
}

/* ===== 메시지 컨텍스트 메뉴(이모지 + 액션) ===== */
const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export type MessageAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onSelect: () => void;
};

export function ReactionPicker({
  mine,
  onPick,
  onDismiss,
  actions = [],
  header,
}: {
  mine: boolean;
  onPick: (emoji: string) => void;
  onDismiss: () => void;
  actions?: MessageAction[];
  /** 액션 메뉴 상단에 표시할 부가 정보(예: 보낸 시각) */
  header?: string;
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

  // 긴 버블일 때 위쪽으로 띄우면 스크롤 컨테이너/뷰포트에서 잘리므로
  // 렌더 직후 측정 → 잘리면 버블 하단으로 뒤집음.
  const ref = useRef<HTMLDivElement | null>(null);
  const [flip, setFlip] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 가장 가까운 스크롤 가능한 조상 찾기
    let p: HTMLElement | null = el.parentElement;
    let limitTop = 0;
    while (p) {
      const style = window.getComputedStyle(p);
      if (/(auto|scroll)/.test(style.overflowY)) {
        limitTop = p.getBoundingClientRect().top;
        break;
      }
      p = p.parentElement;
    }
    if (r.top < limitTop + 4) setFlip(true);
  }, []);

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        ...(flip
          ? { top: "calc(100% + 6px)" }
          : { bottom: "calc(100% + 6px)" }),
        [mine ? "right" : "left"]: 0,
        zIndex: 10,
        display: "flex",
        flexDirection: "column",
        alignItems: mine ? "flex-end" : "flex-start",
        gap: 8,
        animation: "hinest-pop .14s cubic-bezier(.22,.61,.36,1)",
      } as React.CSSProperties}
    >
      <style>{`@keyframes hinest-pop {
        from { transform: scale(.85) translateY(4px); opacity: 0; }
        to   { transform: scale(1) translateY(0); opacity: 1; }
      }`}</style>

      {/* 이모지 행 */}
      <div
        style={{
          background: C.surface,
          border: `1px solid ${C.gray200}`,
          borderRadius: 999,
          padding: "4px 6px",
          display: "flex",
          alignItems: "center",
          gap: 2,
          boxShadow:
            "0 8px 24px rgba(25, 31, 40, .14), 0 2px 6px rgba(25, 31, 40, .06)",
        }}
      >
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

      {/* 액션 메뉴 */}
      {(actions.length > 0 || header) && (
        <div
          style={{
            background: C.surface,
            border: `1px solid ${C.gray200}`,
            borderRadius: 14,
            minWidth: 200,
            padding: 4,
            boxShadow:
              "0 10px 28px rgba(25, 31, 40, .16), 0 2px 6px rgba(25, 31, 40, .06)",
            overflow: "hidden",
          }}
        >
          {header && (
            <div
              style={{
                padding: "8px 12px 6px",
                fontSize: 11,
                fontWeight: 600,
                color: C.gray500,
                fontFamily: FONT,
                borderBottom: `1px solid ${C.gray100}`,
                marginBottom: 2,
              }}
            >
              {header}
            </div>
          )}
          {actions.map((a, i) => (
            <button
              key={a.key}
              type="button"
              onClick={() => {
                a.onSelect();
                onDismiss();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                background: "transparent",
                border: 0,
                borderTop: i === 0 ? "none" : `1px solid ${C.gray100}`,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: FONT,
                color: a.danger ? "#F04452" : C.ink,
                textAlign: "left",
                transition: "background .12s ease",
              }}
              onMouseEnter={(ev) => {
                ev.currentTarget.style.background = C.gray100;
              }}
              onMouseLeave={(ev) => {
                ev.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  width: 18,
                  height: 18,
                  display: "grid",
                  placeItems: "center",
                  color: a.danger ? "#F04452" : C.gray600,
                }}
              >
                {a.icon}
              </span>
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* 액션 아이콘 (stroke-current) */
const ICON_SVG = (d: React.ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);
export const ActionIcons = {
  copy: ICON_SVG(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  download: ICON_SVG(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>),
  pin: ICON_SVG(<><path d="M12 17v5" /><path d="M5 2h14l-2 7 3 5H4l3-5-2-7z" /></>),
  unpin: ICON_SVG(<><path d="M3 3l18 18" /><path d="M12 17v5" /><path d="M5 2h14l-2 7 3 5h-5" /></>),
};

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

/* ===== 메시지 버블 — 텍스트 / 이미지 / 비디오 / 파일 =====
 *
 * React.memo 로 감싼다. 메시지 리스트는 거의 append-only 라 대부분의 기존 버블은
 * props 가 그대로다 (msg 참조·mine 동일). memo 로 재렌더를 차단하면 1.5초 증분
 * 폴링마다 전체 리스트가 아니라 "새로 추가된 것" 만 렌더된다.
 *
 * msg 는 서버 응답이 들어올 때마다 새 객체지만, 증분 폴링은 기존 요소를 그대로
 * 두고 새 요소만 append 하므로 기존 msg reference 는 유지된다. full 동기화
 * 때는 배열 전체가 새로 만들어져 모두 재렌더되는데, 그건 15초에 한 번이라 허용.
 */
function MessageBubbleInner({ msg, mine }: { msg: Message; mine: boolean }) {
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
        <ImageThumb src={fileUrl!} alt={msg.fileName ?? ""} />
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
            maxWidth: 180,
            maxHeight: 200,
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
            color: mine ? C.brandFg : C.ink,
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
              background: mine ? "rgba(255,255,255,.2)" : C.surface,
              color: mine ? C.brandFg : C.gray700,
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

// 얕은 비교로 충분 — msg 는 서버에서 객체 그대로 넘어오고, 증분 폴링 때 기존 요소의
// 참조는 바뀌지 않는다. full 동기화(15초 주기) 시에만 reference 가 새로 만들어져
// 재렌더가 발생 → 의도된 동작.
export const MessageBubble = memo(
  MessageBubbleInner,
  (a, b) => a.mine === b.mine && a.msg === b.msg
);

// URL 자동 링크화 — http(s):// 또는 www. 로 시작하는 문자열을 <a> 로 변환.
// 안전 조치: href 는 반드시 http/https 로만 구성하고, rel=noopener noreferrer + target=_blank.
const URL_REGEX = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;

function renderWithLinks(content: string, mine: boolean): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(content)) !== null) {
    const raw = match[0];
    const start = match.index;
    if (start > lastIndex) nodes.push(content.slice(lastIndex, start));
    // 문장 끝 구두점은 링크에서 제외
    const trailing = raw.match(/[).,!?;:]+$/);
    const clean = trailing ? raw.slice(0, raw.length - trailing[0].length) : raw;
    const href = clean.startsWith("http") ? clean : `https://${clean}`;
    nodes.push(
      <a
        key={start}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: mine ? "#fff" : C.blue,
          textDecoration: "underline",
          textUnderlineOffset: 2,
          wordBreak: "break-all",
        }}
        onClick={(e) => {
          e.stopPropagation();
          // Electron 데스크톱 앱 안에서는 OS 기본 브라우저로 강제 열기
          const bridge = (window as any).hinest;
          if (bridge && typeof bridge.openExternal === "function") {
            e.preventDefault();
            bridge.openExternal(href);
          }
        }}
      >
        {clean}
      </a>
    );
    if (trailing) nodes.push(trailing[0]);
    lastIndex = start + raw.length;
  }
  if (lastIndex < content.length) nodes.push(content.slice(lastIndex));
  return nodes;
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
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
        minWidth: 0,
        maxWidth: "100%",
        color: mine ? C.brandFg : C.ink,
        background: mine ? C.blue : C.gray100,
        borderRadius: 16,
        fontFamily: FONT,
      }}
    >
      {renderWithLinks(content, mine)}
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
        loading="lazy"
        decoding="async"
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
            background: C.surface,
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
