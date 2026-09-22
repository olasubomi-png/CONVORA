import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnv } from "@/lib/env";
import * as schema from "@/db/schema";

export type Database = ReturnType<typeof createDatabase>;

function connectionOptions(connectionString: string) {
  const isLocal =
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");
  return {
    max: 1 as const,
    prepare: false as const,
    idle_timeout: 20,
    connect_timeout: 15,
    // Neon and other managed Postgres require TLS. Local test DBs do not.
    ...(isLocal ? {} : { ssl: "require" as const }),
  };
}

function createDatabase(connectionString: string) {
  const client = postgres(connectionString, connectionOptions(connectionString));
  return drizzle(client, { schema });
}

let database: Database | undefined;

export function getDatabase(): Database {
  if (!database) {
    database = createDatabase(getServerEnv().DATABASE_URL);
  }
  return database;
}

export function createDatabaseFromUrl(connectionString: string): Database {
  return createDatabase(connectionString);
}

export function resetDatabaseSingleton(): void {
  database = undefined;
}

/**
 * Production readiness probe: verify the app can open a Postgres session
 * using the same client options as the application database layer.
 *
 * Uses process.env.DATABASE_URL directly so readiness measures database
 * connectivity, not full production env validation (CHANNEL_SECRETS_KEY, etc.).
 * Never logs or returns the connection string.
 */
export async function probeDatabaseConnectivity(): Promise<{
  ok: true;
  latencyMs: number;
} | {
  ok: false;
  reason: "missing_url" | "connection_failed";
}> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.trim().length === 0) {
    return { ok: false, reason: "missing_url" };
  }

  const started = Date.now();
  const client = postgres(connectionString, connectionOptions(connectionString));
  try {
    await client`select 1 as ok`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, reason: "connection_failed" };
  } finally {
    await client.end({ timeout: 5 }).catch(() => undefined);
  }
}
