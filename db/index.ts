import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getServerEnv } from "@/lib/env";
import * as schema from "@/db/schema";

export type Database = ReturnType<typeof createDatabase>;

function createDatabase(connectionString: string) {
  const client = postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
  });
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
