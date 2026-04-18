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
    };
  }
}
