/**
 * Map driver-level unique constraint violations to application errors.
 * Drizzle/postgres.js may wrap the underlying PostgresError.
 */

type PostgresLikeError = {
  code?: string;
  constraint_name?: string;
  constraint?: string;
  message?: string;
  cause?: unknown;
};

function asPostgresLike(error: unknown): PostgresLikeError | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  return error as PostgresLikeError;
}

export function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;

  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const pg = asPostgresLike(current);
    if (pg?.code === "23505") {
      return true;
    }
    // postgres.js sometimes puts code on the error directly; drizzle wraps message
    const message = pg?.message ?? "";
    if (
      typeof message === "string" &&
      (message.includes("duplicate key") || message.includes("unique constraint"))
    ) {
      return true;
    }
    current = pg?.cause;
  }
  return false;
}

export function uniqueConstraintName(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const pg = asPostgresLike(current);
    if (pg?.constraint_name || pg?.constraint) {
      return pg.constraint_name ?? pg.constraint;
    }
    current = pg?.cause;
  }
  return undefined;
}
