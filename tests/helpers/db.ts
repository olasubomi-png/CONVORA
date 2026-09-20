import { sql } from "drizzle-orm";
import { createDatabaseFromUrl, resetDatabaseSingleton } from "@/db";
import { resetServerEnvCache } from "@/lib/env";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://convora:convora@127.0.0.1:5432/convora_test";

export function setupTestEnv(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.APP_URL = "http://localhost:3000";
  resetServerEnvCache();
  resetDatabaseSingleton();
}

export function getTestDb() {
  setupTestEnv();
  return createDatabaseFromUrl(TEST_DATABASE_URL);
}

export async function truncateAllTables(): Promise<void> {
  const db = getTestDb();
  await db.execute(sql`TRUNCATE TABLE audit_events, sessions, memberships, organizations, users RESTART IDENTITY CASCADE`);
}
