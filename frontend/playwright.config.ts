import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./browser-tests",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: process.env.RETENTION_TEST_URL ?? "http://127.0.0.1:5173",
    headless: true,
    acceptDownloads: true,
  },
  reporter: "list",
});
