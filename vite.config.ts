import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "StockNote",
        short_name: "StockNote",
        description: "台股加權指數技術分析 ＋ 交易日誌",
        lang: "zh-Hant",
        display: "standalone",
        background_color: "#0f131b",
        theme_color: "#0f131b",
        start_url: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
    }),
  ],
  // 本機開發時把 /api 轉到 `npm run dev:api`（wrangler dev, :8787）。
  // 保留 Origin/Host 為 localhost:5173，才符合 Better Auth 的 baseURL。
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: false },
    },
  },
});
