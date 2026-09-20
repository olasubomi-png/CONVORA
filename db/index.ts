import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnv } from "@/lib/env";
import { schema } from "@/db/schema";

export type Database = ReturnType<typeof createDatabase>;

function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    max: 1,
    prepare: false,
  });

  return drizzle(client, { schema });
}

let database: Database | undefined;

/**
 * Server-only database client.
 * Connection string comes from validated environment configuration.
 */
export function getDatabase(): Database {
  if (!database) {
    const env = getServerEnv();
    database = createDatabase(env.DATABASE_URL);
  }

  return database;
}

export function createDatabaseFromUrl(connectionString: string): Database {
  return createDatabase(connectionString);
}
