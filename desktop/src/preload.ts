import { contextBridge, ipcRenderer } from "electron";

/**
 * 렌더러 전용 안전 브릿지.
 * 웹앱이 `window.hinest` 로 호출 가능.
 */
contextBridge.exposeInMainWorld("hinest", {
  platform: process.platform,
  isDesktop: true,
  appVersion: process.env.HINEST_APP_VERSION ?? "",
  deviceId: process.env.HINEST_DEVICE_ID ?? "",
  setBadge: (count: number) => ipcRenderer.invoke("hinest:setBadge", count),
  flashFrame: () => ipcRenderer.invoke("hinest:flashFrame"),
  showNotification: (opts: { title: string; body?: string; silent?: boolean }) =>
    ipcRenderer.invoke("hinest:showNotification", opts),
  relaunch: () => ipcRenderer.invoke("hinest:relaunch"),
  canTouchID: () => ipcRenderer.invoke("hinest:canTouchID") as Promise<boolean>,
  promptTouchID: (reason: string) =>
    ipcRenderer.invoke("hinest:promptTouchID", reason) as Promise<{ ok: boolean; error?: string }>,
  onFullscreenChange: (cb: (isFs: boolean) => void) => {
    const handler = (_e: unknown, v: boolean) => cb(!!v);
    ipcRenderer.on("hinest:fullscreen", handler);
    return () => ipcRenderer.removeListener("hinest:fullscreen", handler);
  },
});
