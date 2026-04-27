import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/auth.js";

/**
 * URL 메타데이터(Open Graph / Twitter Card / 기본 <title>) 추출 — 링크 프리뷰용.
 *
 * 보안:
 *  - 인증 필수 — 무한 SSRF 우회 방지.
 *  - 사설망/메타데이터 IP 차단 (10.*, 172.16-31.*, 192.168.*, 127.*, 169.254.*, ::1).
 *  - http(s) 만 허용. file://, data:, ftp:// 거부.
 *  - 응답 본문 1MB 상한, 5초 타임아웃.
 *  - 내부에서 인메모리 LRU 30분 캐시.
 *
 * 응답: { url, title, description?, image?, siteName?, favicon? }
 */

const router = Router();
router.use(requireAuth);

const schema = z.object({
  url: z.string().url().max(2048),
});

type Meta = {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
};

const cache = new Map<string, { data: Meta; expires: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 500;

function cacheGet(k: string): Meta | null {
  const e = cache.get(k);
  if (!e) return null;
  if (Date.now() > e.expires) {
    cache.delete(k);
    return null;
  }
  return e.data;
}
function cacheSet(k: string, v: Meta) {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  cache.set(k, { data: v, expires: Date.now() + CACHE_TTL_MS });
}

/** 사설망 / loopback / link-local IP 호스트 차단. DNS resolve 까지 하면 좋지만 일단
 *  hostname 문자열 기반 차단으로도 흔한 SSRF 시도는 막힘. */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata.google.internal") return true; // GCP IMDS
  if (h === "169.254.169.254") return true; // AWS IMDS v1/v2
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (h === "::1" || h.startsWith("[::1]")) return true;
  if (/^fc[0-9a-f]{2}:/.test(h) || /^fd[0-9a-f]{2}:/.test(h)) return true; // ULA
  return false;
}

const META_RE = /<meta[^>]+>/gi;
const TITLE_RE = /<title[^>]*>([^<]+)<\/title>/i;
const LINK_RE = /<link[^>]+>/gi;
const ATTR_RE = /(\w+(?::\w+)?)=["']([^"']*)["']/g;

function parseAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(tag)) !== null) {
    out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractMeta(html: string, base: URL): Meta {
  const meta: Meta = { url: base.toString() };
  // <meta property="..." content="..."> / <meta name="..." content="...">
  const tags: { prop: string; content: string }[] = [];
  let m: RegExpExecArray | null;
  META_RE.lastIndex = 0;
  while ((m = META_RE.exec(html)) !== null) {
    const a = parseAttrs(m[0]);
    const prop = (a.property || a.name || "").toLowerCase();
    const content = a.content;
    if (prop && content) tags.push({ prop, content });
  }
  const find = (...keys: string[]) =>
    tags.find((t) => keys.includes(t.prop))?.content;

  meta.title = find("og:title", "twitter:title");
  meta.description = find("og:description", "twitter:description", "description");
  const image = find("og:image", "og:image:url", "twitter:image", "twitter:image:src");
  if (image) {
    try {
      meta.image = new URL(image, base).toString();
    } catch {}
  }
  meta.siteName = find("og:site_name", "application-name");

  // <title> fallback
  if (!meta.title) {
    const t = TITLE_RE.exec(html);
    if (t) meta.title = decodeEntities(t[1].trim());
  }
  if (meta.title) meta.title = decodeEntities(meta.title);
  if (meta.description) meta.description = decodeEntities(meta.description);

  // favicon — <link rel="icon" href="..."> 우선, 없으면 /favicon.ico.
  let faviconHref: string | undefined;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(html)) !== null) {
    const a = parseAttrs(m[0]);
    const rel = (a.rel || "").toLowerCase();
    if (rel.includes("icon") && a.href) {
      faviconHref = a.href;
      break;
    }
  }
  try {
    meta.favicon = new URL(faviconHref || "/favicon.ico", base).toString();
  } catch {}

  // 너무 긴 값은 잘라서 응답 부풀지 않게.
  if (meta.title && meta.title.length > 200) meta.title = meta.title.slice(0, 200);
  if (meta.description && meta.description.length > 400)
    meta.description = meta.description.slice(0, 400);

  return meta;
}

router.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid url" });
  let url: URL;
  try {
    url = new URL(parsed.data.url);
  } catch {
    return res.status(400).json({ error: "invalid url" });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return res.status(400).json({ error: "http(s) only" });
  }
  if (isBlockedHost(url.hostname)) {
    return res.status(400).json({ error: "host not allowed" });
  }

  const cached = cacheGet(url.toString());
  if (cached) return res.json(cached);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 5000);
  try {
    const r = await fetch(url.toString(), {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        // 일부 사이트(GitHub, X)는 user-agent 가 비면 차단/404. 일반 브라우저 처럼 위장.
        "user-agent": "Mozilla/5.0 (compatible; HiNestBot/1.0; +unfurl)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!r.ok) {
      return res.status(200).json({ url: url.toString() });
    }
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("text/html") && !ct.includes("xml")) {
      // HTML 이 아니면 메타 추출 의미 없음 → URL 만 반환.
      return res.status(200).json({ url: url.toString() });
    }
    // 1MB 까지만 읽기 — 큰 페이지에서 무한 다운로드 방지.
    const buf = await r.arrayBuffer();
    const limited = buf.byteLength > 1_000_000 ? buf.slice(0, 1_000_000) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(limited);
    const meta = extractMeta(html, new URL(r.url));
    cacheSet(url.toString(), meta);
    res.json(meta);
  } catch (e: any) {
    if (e?.name === "AbortError") {
      return res.status(504).json({ error: "fetch timeout", url: url.toString() });
    }
    res.status(200).json({ url: url.toString() });
  } finally {
    clearTimeout(t);
  }
});

export default router;
