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
  process.env.AI_PROVIDER = "mock";
  // 32 zero bytes base64 — tests only
  process.env.CHANNEL_SECRETS_KEY =
    process.env.CHANNEL_SECRETS_KEY ??
    Buffer.alloc(32, 7).toString("base64");
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
      domain_event_outbox,
      automation_executions,
      automation_rule_definitions,
      automation_rules,
      conversation_assignment_history,
      conversation_watchers,
      team_memberships,
      teams,
      agent_presence,
      channel_message_deliveries,
      channel_inbound_events,
      customer_channel_identities,
      channel_installations,
      web_chat_message_idempotency,
      web_chat_visitors,
      web_chat_installations,
      ai_suggestions,
      ai_generations,
      customer_attribute_values,
      customer_attribute_definitions,
      customer_tag_links,
      customer_notes,
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
