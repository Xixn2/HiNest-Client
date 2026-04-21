export {};

declare global {
  interface Window {
    hinest?: {
      platform: "darwin" | "win32" | "linux" | string;
      isDesktop: true;
      appVersion: string;
      setBadge: (count: number) => Promise<void>;
      flashFrame: () => Promise<void>;
      showNotification: (opts: { title: string; body?: string; silent?: boolean }) => Promise<void>;
      relaunch: () => Promise<void>;
      onFullscreenChange: (cb: (isFs: boolean) => void) => () => void;
      // ─── 자동 업데이트 ──────────────────────────────────────────
      checkForUpdates?: () => Promise<{ ok: boolean; version?: string | null; error?: string }>;
      quitAndInstall?: () => Promise<void>;
      onUpdateDownloaded?: (cb: (info: { version: string; notes?: string }) => void) => () => void;
      onUpdateProgress?: (cb: (p: { percent: number }) => void) => () => void;
    };
  }
}
