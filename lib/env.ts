import { z } from "zod";

const nodeEnvSchema = z.enum(["development", "test", "production"]);

const serverEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) =>
        value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    ),
  APP_URL: z
    .string()
    .url("APP_URL must be a valid URL")
    .refine((value) => !value.endsWith("/"), "APP_URL must not end with a slash"),
  NODE_ENV: nodeEnvSchema.default("development"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export type EnvParseResult =
  | { success: true; data: ServerEnv }
  | { success: false; error: z.ZodError };

/**
 * Parse server environment from an arbitrary record.
 * Safe to call from tests without reading process.env.
 */
export function parseServerEnv(
  source: Record<string, string | undefined>,
): EnvParseResult {
  const result = serverEnvSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL,
    APP_URL: source.APP_URL,
    NODE_ENV: source.NODE_ENV,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data };
}

export function formatEnvIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
}

let cachedEnv: ServerEnv | undefined;

/**
 * Validated server-only environment.
 * Do not import this module from Client Components.
 */
export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = parseServerEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    APP_URL: process.env.APP_URL,
    NODE_ENV: process.env.NODE_ENV,
  });

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${formatEnvIssues(parsed.error)}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetServerEnvCache(): void {
  cachedEnv = undefined;
}
