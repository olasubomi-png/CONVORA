import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/integration",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  use: { baseURL: process.env.APP_URL ?? "http://localhost:3000", trace: "on-first-retry" },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://convora:convora@127.0.0.1:5432/convora",
      APP_URL: process.env.APP_URL ?? "http://localhost:3000",
      NODE_ENV: "production",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
