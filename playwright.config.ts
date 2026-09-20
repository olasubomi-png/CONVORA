import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests always target a dedicated test database.
 * Prefer TEST_DATABASE_URL; never silently reuse an ambient production DATABASE_URL.
 */
function resolveE2eDatabaseUrl(): string {
  const fromTest = process.env.TEST_DATABASE_URL?.trim();
  if (fromTest) {
    return fromTest;
  }

  const fallback = "postgresql://convora:convora@127.0.0.1:5432/convora_test";
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("_test")) {
    // Refuse to start the app server against a non-test DB during E2E.
    throw new Error(
      "Playwright E2E requires TEST_DATABASE_URL (or a DATABASE_URL containing '_test'). " +
        "Refusing to use a non-test DATABASE_URL.",
    );
  }
  return process.env.DATABASE_URL?.includes("_test")
    ? process.env.DATABASE_URL
    : fallback;
}

const e2eDatabaseUrl = resolveE2eDatabaseUrl();
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/integration",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: appUrl,
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run start",
    url: appUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      APP_URL: appUrl,
      NODE_ENV: "production",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
