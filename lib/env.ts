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
  /** Optional. When unset, AI features return a configuration error. */
  AI_PROVIDER: z.enum(["openai", "mock"]).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  /** Base64-encoded 32-byte AES key for channel credential encryption. */
  CHANNEL_SECRETS_KEY: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export type EnvParseResult =
  | { success: true; data: ServerEnv }
  | { success: false; error: z.ZodError };

export function parseServerEnv(
  source: Record<string, string | undefined>,
): EnvParseResult {
  const result = serverEnvSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL,
    APP_URL: source.APP_URL,
    NODE_ENV: source.NODE_ENV,
    AI_PROVIDER: source.AI_PROVIDER,
    OPENAI_API_KEY: source.OPENAI_API_KEY,
    OPENAI_MODEL: source.OPENAI_MODEL,
    CHANNEL_SECRETS_KEY: source.CHANNEL_SECRETS_KEY,
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

export function getServerEnv(): ServerEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = parseServerEnv({
    DATABASE_URL: process.env.DATABASE_URL,
    APP_URL: process.env.APP_URL,
    NODE_ENV: process.env.NODE_ENV,
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    CHANNEL_SECRETS_KEY: process.env.CHANNEL_SECRETS_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${formatEnvIssues(parsed.error)}`,
    );
  }

  if (
    parsed.data.NODE_ENV === "production" &&
    !parsed.data.CHANNEL_SECRETS_KEY
  ) {
    throw new Error(
      "Invalid environment configuration: CHANNEL_SECRETS_KEY is required in production",
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetServerEnvCache(): void {
  cachedEnv = undefined;
}
