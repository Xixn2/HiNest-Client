/**
 * 사내톡·회의록의 평문에서 코드 영역을 추출.
 *
 * 두 가지 신호:
 *  1) 명시적 펜스 — ``` ... ``` (선택적 언어 태그)
 *  2) 휴리스틱 — 같은 들여쓰기·여러 줄에 걸쳐 코드처럼 보이는 토큰이 충분히 모이면 코드로 간주
 *
 * 일반 사용자가 "그냥 코드 붙여넣었는데 어떻게든 보이게" 시나리오를 노린 것.
 * 다국어/한글 평문이 코드로 오인되지 않도록 휴리스틱은 보수적으로:
 *  - 최소 2줄 이상
 *  - 줄 절반 이상이 코드 토큰을 포함
 *  - 한글 비율이 너무 높지 않을 것
 */

export type CodeSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; code: string; lang?: string }
  | { kind: "inline-code"; code: string };

const FENCE = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
const INLINE = /`([^`\n]+)`/g;

// 코드 토큰 — 평문에 자연스럽게 잘 안 등장하는 기호/키워드 위주.
const CODE_TOKEN = /(=>|::|->|;\s*$|\{\s*$|^\s*\}|^\s*function\b|^\s*const\b|^\s*let\b|^\s*var\b|^\s*if\s*\(|^\s*for\s*\(|^\s*while\s*\(|^\s*return\b|^\s*import\b|^\s*from\s+['"]|^\s*export\b|^\s*class\b|^\s*def\s+\w+|^\s*public\s+|^\s*private\s+|^\s*<\?php|^\s*#include|^\s*SELECT\b|^\s*INSERT\b|^\s*UPDATE\b|^\s*DELETE\b)/m;

const HANGUL = /[ㄱ-힝]/;

/** 휴리스틱: 멀티라인 평문이 "코드 같다" 면 true. */
function looksLikeCode(text: string): boolean {
  const lines = text.split("\n");
  if (lines.length < 2) return false;
  let codey = 0;
  let hangulLines = 0;
  for (const ln of lines) {
    if (!ln.trim()) continue;
    if (CODE_TOKEN.test(ln)) codey++;
    if (HANGUL.test(ln)) hangulLines++;
  }
  const nonEmpty = lines.filter((l) => l.trim()).length;
  if (nonEmpty < 2) return false;
  // 한글 비율이 절반을 넘으면 코드 아님 (대화 본문일 확률 높음).
  if (hangulLines / nonEmpty > 0.5) return false;
  // 코드 토큰이 비어있지 않은 줄의 절반 이상.
  return codey >= Math.max(2, Math.ceil(nonEmpty / 2));
}

/**
 * 본문을 segment 배열로 쪼갬.
 * 1) 펜스 블록을 먼저 떼어내고
 * 2) 남은 평문에서 인라인 백틱 처리
 * 3) 인라인 백틱조차 없는 평문 통째가 휴리스틱에 걸리면 code 로 변환
 */
export function parseCodeSegments(content: string): CodeSegment[] {
  const out: CodeSegment[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  FENCE.lastIndex = 0;
  while ((m = FENCE.exec(content)) !== null) {
    if (m.index > lastIndex) {
      out.push(...splitInlineAndHeuristic(content.slice(lastIndex, m.index)));
    }
    out.push({ kind: "code", lang: m[1] || undefined, code: m[2].replace(/\n$/, "") });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < content.length) {
    out.push(...splitInlineAndHeuristic(content.slice(lastIndex)));
  }
  // 빈 텍스트 제거.
  return out.filter((s) => !(s.kind === "text" && s.text === ""));
}

function splitInlineAndHeuristic(text: string): CodeSegment[] {
  // 인라인 백틱이 있으면 거기 우선, 없으면 통째로 휴리스틱 검사.
  if (!text.includes("`")) {
    if (looksLikeCode(text)) {
      // 앞뒤 공백 줄을 떼서 코드 블록만 남기고 나머지 텍스트를 전후로 분리.
      const trimmed = text.replace(/^\n+|\n+$/g, "");
      const before = text.slice(0, text.indexOf(trimmed));
      const after = text.slice(before.length + trimmed.length);
      const out: CodeSegment[] = [];
      if (before) out.push({ kind: "text", text: before });
      out.push({ kind: "code", code: trimmed });
      if (after) out.push({ kind: "text", text: after });
      return out;
    }
    return [{ kind: "text", text }];
  }
  const out: CodeSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push({ kind: "text", text: text.slice(last, m.index) });
    out.push({ kind: "inline-code", code: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}
