import { sql } from "drizzle-orm";
import { getDatabase, resetDatabaseSingleton } from "@/db";
import { resetServerEnvCache } from "@/lib/env";

function resolveTestDatabaseUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL?.trim();
  if (explicit) {
    if (!explicit.includes("_test") && process.env.ALLOW_NON_TEST_DB !== "1") {
      throw new Error(
        "TEST_DATABASE_URL must reference a dedicated test database (name should include '_test'), " +
          "or set ALLOW_NON_TEST_DB=1 to override deliberately.",
      );
    }
    return explicit;
  }
  return "postgresql://convora:convora@127.0.0.1:5432/convora_test";
}

const TEST_DATABASE_URL = resolveTestDatabaseUrl();
let envReady = false;

export function getTestDatabaseUrl(): string {
  return TEST_DATABASE_URL;
}

export function setupTestEnv(): void {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.APP_URL = process.env.APP_URL ?? "http://localhost:3000";
  if (!envReady) {
    resetServerEnvCache();
    resetDatabaseSingleton();
    envReady = true;
  }
}

export function getTestDb() {
  setupTestEnv();
  return getDatabase();
}

export async function truncateAllTables(): Promise<void> {
  const db = getTestDb();
  await db.execute(sql`
    TRUNCATE TABLE
      conversation_read_state,
      conversation_tag_links,
      conversation_tags,
      conversation_assignments,
      conversation_notes,
      messages,
      conversation_participants,
      conversations,
      customers,
      agent_posts,
      agent_profiles,
      organization_profiles,
      audit_events,
      sessions,
      memberships,
      organizations,
      users
    RESTART IDENTITY CASCADE
  `);
}
