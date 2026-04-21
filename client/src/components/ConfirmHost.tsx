import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * 전역 확인/알림/입력 모달 호스트 — 네이티브 window.confirm/alert/prompt 를 대체한다.
 *
 * 왜 필요한가:
 * - iOS Safari 는 한글 IME 입력 중 confirm/prompt 가 블록되면 입력 창이 얼어붙는 사례가 있음.
 * - 설치형(스탠드얼론) PWA 에선 네이티브 다이얼로그가 아예 안 뜨는 경우도 있음.
 * - 브라우저마다 생김새가 제각각이라 UI 일관성이 깨짐.
 *
 * 사용법 (동기→비동기 교체):
 *   if (!(await confirmAsync({ description: "삭제할까요?", tone: "danger" }))) return;
 *   await alertAsync({ description: "저장했어요" });
 *   const name = await promptAsync({ title: "새 이름", defaultValue: f.name });
 *
 * 동시에 여러 개 열리지는 않게 큐잉이 아니라 "마지막 호출 우선" — 이전 프라미스는 cancel(false/null) 로 resolve.
 */

type ConfirmOpts = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
};

type AlertOpts = {
  title?: string;
  description?: string;
  confirmLabel?: string;
};

type PromptOpts = {
  title?: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type Dialog =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "alert"; opts: AlertOpts; resolve: () => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void };

// 싱글턴 상태 — 훅 없이 모듈 어디서나 호출할 수 있게.
let currentDialog: Dialog | null = null;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function emit() {
  listeners.forEach((cb) => cb());
}

function getSnapshot() {
  return currentDialog;
}

function cancelPrevious() {
  if (!currentDialog) return;
  const d = currentDialog;
  currentDialog = null;
  if (d.kind === "confirm") d.resolve(false);
  else if (d.kind === "alert") d.resolve();
  else d.resolve(null);
}

export function confirmAsync(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    cancelPrevious();
    currentDialog = { kind: "confirm", opts, resolve };
    emit();
  });
}

export function alertAsync(opts: AlertOpts): Promise<void> {
  return new Promise((resolve) => {
    cancelPrevious();
    currentDialog = { kind: "alert", opts, resolve };
    emit();
  });
}

export function promptAsync(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => {
    cancelPrevious();
    currentDialog = { kind: "prompt", opts, resolve };
    emit();
  });
}

function close() {
  currentDialog = null;
  emit();
}

export default function ConfirmHost() {
  const dialog = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  // prompt 열릴 때 defaultValue 세팅 + 자동 포커스.
  useEffect(() => {
    if (dialog?.kind === "prompt") {
      setValue(dialog.opts.defaultValue ?? "");
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [dialog]);

  // ESC 로 취소/닫기.
  useEffect(() => {
    if (!dialog) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (!dialog) return;
        if (dialog.kind === "confirm") dialog.resolve(false);
        else if (dialog.kind === "alert") dialog.resolve();
        else dialog.resolve(null);
        close();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  if (!dialog) return null;

  const onCancel = () => {
    if (dialog.kind === "confirm") dialog.resolve(false);
    else if (dialog.kind === "alert") dialog.resolve();
    else dialog.resolve(null);
    close();
  };
  const onConfirm = () => {
    if (dialog.kind === "confirm") dialog.resolve(true);
    else if (dialog.kind === "alert") dialog.resolve();
    else dialog.resolve(value);
    close();
  };

  const title =
    dialog.opts.title ??
    (dialog.kind === "alert" ? "알림" : dialog.kind === "prompt" ? "입력" : "확인");
  const confirmLabel = dialog.opts.confirmLabel ?? "확인";
  const cancelLabel =
    dialog.kind === "prompt" || dialog.kind === "confirm"
      ? (dialog.opts as ConfirmOpts).cancelLabel ?? "취소"
      : null;
  const tone = dialog.kind === "confirm" ? dialog.opts.tone : undefined;

  return (
    <div
      className="fixed inset-0 bg-ink-900/40 grid place-items-center p-4 z-[200]"
      onClick={onCancel}
    >
      <div
        className="panel w-full max-w-[420px] shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="section-head">
          <div className="title">{title}</div>
        </div>
        <div className="p-5 space-y-3">
          {dialog.opts.description && (
            <div className="text-[13px] text-ink-700 leading-[1.55] whitespace-pre-line">
              {dialog.opts.description}
            </div>
          )}
          {dialog.kind === "prompt" && (
            <input
              ref={inputRef}
              className="input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={dialog.opts.placeholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onConfirm();
                }
              }}
            />
          )}
        </div>
        <div className="border-t border-ink-150 px-5 py-3 flex justify-end gap-2">
          {cancelLabel && (
            <button type="button" className="btn-ghost" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            className={tone === "danger" ? "btn-danger" : "btn-primary"}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
