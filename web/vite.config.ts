import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const proxy = {
  "/api": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:3333" },
};
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { host: "localhost", port: 4173, strictPort: true, proxy },
});
