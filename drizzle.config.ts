import { defineConfig } from "drizzle-kit";
import { parseServerEnv, formatEnvIssues } from "./lib/env";

const parsed = parseServerEnv({
  DATABASE_URL: process.env.DATABASE_URL,
  APP_URL: process.env.APP_URL ?? "http://localhost:3000",
  NODE_ENV: process.env.NODE_ENV ?? "development",
});

if (!parsed.success) {
  throw new Error(`Invalid environment for drizzle-kit: ${formatEnvIssues(parsed.error)}`);
}

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: parsed.data.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
