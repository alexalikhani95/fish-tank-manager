import { defineConfig, devices } from "@playwright/test";

const mongoUrl =
  process.env.MONGO_BROWSER_URL ?? "mongodb://127.0.0.1:27017/fishtank_browser";
export default defineConfig({
  testDir: "./tests/browser",
  globalSetup: "../app/tests/helpers/browser_database.ts",
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { baseURL: "http://localhost:4173", trace: "off" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 320, height: 740 },
      },
    },
  ],
  webServer: [
    {
      command: "cd ../app && node --import=@poppinss/ts-exec bin/server.ts",
      url: "http://127.0.0.1:3334/api/v1/health",
      reuseExistingServer: false,
      env: {
        NODE_ENV: "test",
        TZ: "UTC",
        HOST: "127.0.0.1",
        PORT: "3334",
        LOG_LEVEL: "silent",
        APP_KEY: "browser-only-disposable-app-key-32-chars",
        APP_URL: "http://127.0.0.1:3334",
        JWT_SECRET: "browser-only-disposable-jwt-secret-32-chars",
        MONGO_URL: mongoUrl,
      },
    },
    {
      command: "npm run preview",
      url: "http://localhost:4173",
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: "http://127.0.0.1:3334" },
    },
  ],
});
