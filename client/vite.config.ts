import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1000,
    strictPort: true,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 1000,
  },
  esbuild: {
    // 프로덕션 번들에서 debugger 삭제, console.log/debug/trace 는 "pure" 로 표시해
    // 반환값 사용 안 하면 dead code 로 제거. console.error/warn 은 살려서 장애 단서 유지.
    drop: ["debugger"],
    pure: ["console.log", "console.debug", "console.trace"],
  },
  build: {
    // 큰 라이브러리를 벤더 청크로 분리 — 재배포 때마다 페이지 청크 해시만 바뀌어도
    // 브라우저가 react/router 는 그대로 캐시에서 재사용. HTTP/2 multiplexing 기준
    // 3-5 청크가 sweet spot.
    rollupOptions: {
      output: {
        manualChunks: {
          "react-vendor": ["react", "react-dom"],
          "router-vendor": ["react-router-dom"],
        },
      },
    },
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
