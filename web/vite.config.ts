import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { themeColor } from "./theme.ts";

const proxy = {
  "/api": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3333" },
};
const root = resolve(import.meta.dirname, "..");

// `--mode phone` (npm run phone): built preview over trusted HTTPS on the LAN.
// The certificate and key are local, gitignored inputs (lld.md → Phone access).
const phoneHttps = () => ({
  cert: readFileSync(
    resolve(root, process.env.PHONE_HTTPS_CERT ?? ".certs/phone.pem"),
  ),
  key: readFileSync(
    resolve(root, process.env.PHONE_HTTPS_KEY ?? ".certs/phone-key.pem"),
  ),
});

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "theme-color",
      transformIndexHtml: (html) => html.replace("%THEME_COLOR%", themeColor),
    },
    VitePWA({
      // A new worker waits until every window of the app is closed: no reload
      // can interrupt an entry. The new version runs on the next cold open.
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Fish Tank Manager",
        short_name: "Fish Tanks",
        description: "Log water changes for your Tanks.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: themeColor,
        theme_color: themeColor,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the public shell only. No runtimeCaching: API responses,
        // credentials and writes always go to the network.
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api(\/|\?|$)/],
      },
    }),
  ],
  server: { proxy },
  preview:
    mode === "phone"
      ? { host: true, port: 4173, strictPort: true, proxy, https: phoneHttps() }
      : { host: "localhost", port: 4173, strictPort: true, proxy },
}));
