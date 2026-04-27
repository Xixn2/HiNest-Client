/**
 * 채팅 평문에서 마크다운 토큰을 React 노드로.
 *
 * 코드 펜스/인라인은 codeDetect 가 이미 떼어내므로 여기서는 "code 가 아닌 평문" 만 처리.
 * 풀 마크다운 파서(remark/marked) 는 채팅용으론 무거워서 직접 작성. 사내 메신저 톤
 * (Slack/Jandi) 에 맞춰 다음만 지원:
 *
 *  Block
 *   - "> "          → blockquote
 *   - "- " / "* "   → 순서 없는 리스트
 *   - "1. "         → 순서 있는 리스트
 *
 *  Inline
 *   - **bold**
 *   - *italic* 또는 _italic_  (단, **bold** 는 별도 처리)
 *   - ~~strike~~
 *
 *  URL 자동 링크는 호출 측의 renderWithLinks 가 그대로 처리.
 */

import type { ReactNode } from "react";

type InlineNode = ReactNode;

// **bold** / __bold__ / *italic* / _italic_ / ~~strike~~ 을 단일 RegExp 로 캡쳐.
// 우선순위는 ** > __ > ~~ > * > _ — 더 긴 패턴부터 배치해서 ** 가 * 두 개로 잘못 잡히지 않도록.
const INLINE_RE = /(\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_)/g;

export function renderInlineMarkdown(
  text: string,
  /** URL 등 추가 토큰을 텍스트 조각마다 후처리하기 위한 hook. */
  textTransform?: (chunk: string, key: string) => InlineNode,
): InlineNode[] {
  const out: InlineNode[] = [];
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) {
      const chunk = text.slice(last, m.index);
      out.push(textTransform ? textTransform(chunk, `t${i++}`) : chunk);
    }
    if (m[2] || m[3]) {
      out.push(<strong key={`b${i++}`}>{m[2] ?? m[3]}</strong>);
    } else if (m[4]) {
      out.push(<s key={`s${i++}`} style={{ opacity: 0.75 }}>{m[4]}</s>);
    } else if (m[5] || m[6]) {
      out.push(<em key={`i${i++}`}>{m[5] ?? m[6]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    const tail = text.slice(last);
    out.push(textTransform ? textTransform(tail, `t${i++}`) : tail);
  }
  return out;
}

type Block =
  | { kind: "text"; text: string }
  | { kind: "blockquote"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[]; start: number };

/** 평문을 줄 기준으로 블록 단위로 묶음. */
export function splitBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    const quote = /^> ?(.*)$/.exec(ln);
    if (quote) {
      // 연속된 > 라인 묶기
      const buf: string[] = [];
      while (i < lines.length) {
        const q = /^> ?(.*)$/.exec(lines[i]);
        if (!q) break;
        buf.push(q[1]);
        i++;
      }
      out.push({ kind: "blockquote", text: buf.join("\n") });
      continue;
    }
    const ul = /^[-*] (.+)$/.exec(ln);
    if (ul) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^[-*] (.+)$/.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      out.push({ kind: "ul", items });
      continue;
    }
    const ol = /^(\d+)\.\s+(.+)$/.exec(ln);
    if (ol) {
      const start = parseInt(ol[1], 10);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\d+\.\s+(.+)$/.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      out.push({ kind: "ol", items, start });
      continue;
    }
    // 일반 텍스트는 다음 블록 트리거 줄까지 모음
    const buf: string[] = [];
    while (i < lines.length) {
      const next = lines[i];
      if (
        /^> /.test(next) ||
        /^[-*] /.test(next) ||
        /^\d+\.\s+/.test(next)
      ) break;
      buf.push(next);
      i++;
    }
    out.push({ kind: "text", text: buf.join("\n") });
  }
  return out;
}
