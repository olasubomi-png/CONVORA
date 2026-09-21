/**
 * Extract safe diagnostic fields from unknown errors for structured logs.
 * Never includes secrets, tokens, connection strings, or request bodies.
 */

export type SafeErrorDiagnostics = {
  name: string;
  code?: string;
  subsystem?: string;
  messageSnippet?: string;
};

const SECRET_SNIPPET =
  /(password|secret|token|postgres:\/\/|postgresql:\/\/|Bearer\s|sk_live|sk_test|CHANNEL_SECRETS)/i;

export function classifyError(error: unknown): SafeErrorDiagnostics {
  if (!(error instanceof Error)) {
    return { name: typeof error, subsystem: "unknown" };
  }

  const name = error.name || "Error";
  let code: string | undefined;
  let subsystem = "unknown";

  const anyErr = error as Error & {
    code?: string | number;
    severity?: string;
    routine?: string;
  };

  if (anyErr.code != null) {
    code = String(anyErr.code);
  }

  // Postgres SQLSTATE
  if (code === "42P01") subsystem = "database_missing_relation";
  else if (code === "23505") subsystem = "database_unique_violation";
  else if (code === "23503") subsystem = "database_foreign_key";
  else if (code === "28P01" || code === "28000") subsystem = "database_auth";
  else if (code === "57P01" || code === "57P03") subsystem = "database_unavailable";
  else if (code?.startsWith("08")) subsystem = "database_connection";
  else if (code?.startsWith("53")) subsystem = "database_resources";
  else if (/argon2/i.test(name) || /argon2/i.test(error.message))
    subsystem = "password_hashing";
  else if (/cookie/i.test(error.message)) subsystem = "session_cookie";
  else if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|fetch failed/i.test(error.message))
    subsystem = "network";
  else if (/DATABASE_URL|environment configuration/i.test(error.message))
    subsystem = "configuration";
  else if (code) subsystem = "database";

  let messageSnippet: string | undefined;
  const raw = error.message?.slice(0, 120) ?? "";
  if (raw && !SECRET_SNIPPET.test(raw)) {
    messageSnippet = raw.replace(/\s+/g, " ").trim();
  }

  return { name, code, subsystem, messageSnippet };
}
