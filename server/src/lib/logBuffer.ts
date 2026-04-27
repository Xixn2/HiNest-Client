/**
 * 인메모리 서버 로그 링버퍼 — 총관리자 콘솔에서 보기 위한 용도.
 *
 * 처리:
 *  - console.log/info/warn/error 를 monkey-patch 해서 들어오는 라인을 동시에 버퍼에 적재.
 *  - HTTP 액세스 로그도 미들웨어에서 push.
 *  - 메모리 절약을 위해 최대 2000줄 유지(가장 오래된 것부터 버림).
 *  - 프로세스 재기동 시 초기화 — 디스크 영속화 없음.
 */

export type LogLevel = "info" | "warn" | "error" | "http";

export type LogEntry = {
  ts: number; // epoch ms
  level: LogLevel;
  msg: string;
};

const MAX = 9999;
const buf: LogEntry[] = [];

function pushEntry(level: LogLevel, msg: string) {
  buf.push({ ts: Date.now(), level, msg: msg.length > 4000 ? msg.slice(0, 4000) + "…" : msg });
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
}

export function getLogs(opts: { since?: number; level?: LogLevel; q?: string; limit?: number } = {}): LogEntry[] {
  const limit = Math.min(9999, Math.max(1, opts.limit ?? 500));
  let arr = buf;
  if (opts.since) arr = arr.filter((e) => e.ts > opts.since!);
  if (opts.level) arr = arr.filter((e) => e.level === opts.level);
  if (opts.q) {
    const k = opts.q.toLowerCase();
    arr = arr.filter((e) => e.msg.toLowerCase().includes(k));
  }
  // 최근 N 만 반환.
  return arr.slice(-limit);
}

export function pushHttpLog(line: string) {
  pushEntry("http", line);
}

let installed = false;

/** 한 번만 호출 — console 메서드를 가로채 버퍼에 동기화 적재.
 *  원래 stdout 동작은 유지(서버 콘솔/Cloudwatch 도 그대로 쓰임). */
export function installConsoleHook() {
  if (installed) return;
  installed = true;
  const origLog = console.log.bind(console);
  const origInfo = console.info.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  function fmt(args: any[]): string {
    return args
      .map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a, replaceCircular(), 2);
        } catch {
          return String(a);
        }
      })
      .join(" ");
  }

  console.log = (...args: any[]) => {
    pushEntry("info", fmt(args));
    origLog(...args);
  };
  console.info = (...args: any[]) => {
    pushEntry("info", fmt(args));
    origInfo(...args);
  };
  console.warn = (...args: any[]) => {
    pushEntry("warn", fmt(args));
    origWarn(...args);
  };
  console.error = (...args: any[]) => {
    pushEntry("error", fmt(args));
    origError(...args);
  };
}

/** JSON.stringify 순환 참조 안전망. */
function replaceCircular() {
  const seen = new WeakSet();
  return (_key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };
}
