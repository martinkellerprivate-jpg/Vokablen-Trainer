import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages project page → served under /<repo>/. base must match the repo
// name; the PWA manifest start_url/scope/id and the SW scope all derive from it.
const base = "/Vokablen-Trainer/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        id: base,
        start_url: base,
        scope: base,
        name: "Lilly-Anne's Vokabeltrainer",
        short_name: "Vokabeltrainer",
        description: "Vokabeln üben: Deutsch ⇄ Englisch / Français / Latein.",
        lang: "de",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f1e8d8",
        theme_color: "#f1e8d8",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff2,woff,png,svg,ico}"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: base + "index.html",
        runtimeCaching: [
          // Tesseract worker/core from CDN → cache-first so scan works offline after first use.
          {
            urlPattern: ({ url }) => /(^|\.)(jsdelivr\.net|unpkg\.com)$/.test(url.hostname) && /tesseract/.test(url.href),
            handler: "CacheFirst",
            options: { cacheName: "tesseract-lib", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } },
          },
          // Tesseract language traineddata.
          {
            urlPattern: ({ url }) => url.hostname === "tessdata.projectnaptha.com",
            handler: "CacheFirst",
            options: { cacheName: "tesseract-lang", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
    }),
  ],
});
