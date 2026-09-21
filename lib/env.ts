import { z } from "zod";
import { ConfigurationError } from "@/lib/errors";

const nodeEnvSchema = z.enum(["development", "test", "production"]);

/**
 * Server environment schema.
 *
 * Classification:
 * - DATABASE_URL: required, server-only secret
 * - APP_URL: required, public canonical origin (no trailing slash)
 * - NODE_ENV: required
 * - CHANNEL_SECRETS_KEY: required in production, server-only secret (base64 32-byte key)
 * - PAYSTACK_SECRET_KEY: optional until payments enabled; server-only secret
 * - PAYSTACK_PUBLIC_KEY: optional; client-safe when payments enabled
 * - AI_PROVIDER / OPENAI_*: optional; OPENAI_API_KEY is server-only secret
 *
 * Channel provider tokens (WhatsApp, Meta) are stored encrypted per installation
 * in the database — not as global env vars.
 */
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
  /**
   * Base64-encoded 32-byte AES key for channel credential encryption.
   * Required in production. Never log or return this value.
   */
  CHANNEL_SECRETS_KEY: z.string().min(1).optional(),
  /** Paystack secret key (server-only). Required when accepting payments in production. */
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
  /** Paystack public key (safe for client checkout widgets). */
  PAYSTACK_PUBLIC_KEY: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export type EnvSource = {
  DATABASE_URL?: string;
  APP_URL?: string;
  NODE_ENV?: string;
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  CHANNEL_SECRETS_KEY?: string;
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_PUBLIC_KEY?: string;
};

function isValidChannelSecretsKey(value: string): boolean {
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length === 32;
  } catch {
    return false;
  }
}

export function parseServerEnv(
  source: EnvSource,
):
  | { success: true; data: ServerEnv }
  | { success: false; error: z.ZodError } {
  const result = serverEnvSchema.safeParse({
    DATABASE_URL: source.DATABASE_URL,
    APP_URL: source.APP_URL,
    NODE_ENV: source.NODE_ENV,
    AI_PROVIDER: source.AI_PROVIDER,
    OPENAI_API_KEY: source.OPENAI_API_KEY,
    OPENAI_MODEL: source.OPENAI_MODEL,
    CHANNEL_SECRETS_KEY: source.CHANNEL_SECRETS_KEY,
    PAYSTACK_SECRET_KEY: source.PAYSTACK_SECRET_KEY,
    PAYSTACK_PUBLIC_KEY: source.PAYSTACK_PUBLIC_KEY,
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

/**
 * Production-only invariants beyond Zod schema shape.
 * Never includes secret values in messages.
 */
export function validateProductionEnv(env: ServerEnv): string[] {
  const issues: string[] = [];

  if (env.NODE_ENV !== "production") {
    return issues;
  }

  if (!env.CHANNEL_SECRETS_KEY) {
    issues.push("CHANNEL_SECRETS_KEY is required in production");
  } else if (!isValidChannelSecretsKey(env.CHANNEL_SECRETS_KEY)) {
    issues.push(
      "CHANNEL_SECRETS_KEY must be base64 encoding of exactly 32 bytes",
    );
  }

  if (env.PAYSTACK_PUBLIC_KEY && !env.PAYSTACK_SECRET_KEY) {
    issues.push(
      "PAYSTACK_SECRET_KEY is required when PAYSTACK_PUBLIC_KEY is set in production",
    );
  }

  if (env.AI_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
    issues.push("OPENAI_API_KEY is required when AI_PROVIDER=openai");
  }

  if (env.APP_URL.startsWith("http://") && !env.APP_URL.includes("localhost")) {
    issues.push(
      "APP_URL should use https:// in production (except explicit local tunnel testing)",
    );
  }

  return issues;
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
    PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
    PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY,
  });

  if (!parsed.success) {
    throw new ConfigurationError(
      `Invalid environment configuration: ${formatEnvIssues(parsed.error)}`,
    );
  }

  const productionIssues = validateProductionEnv(parsed.data);
  if (productionIssues.length > 0) {
    throw new ConfigurationError(
      `Invalid environment configuration: ${productionIssues.join("; ")}`,
    );
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetServerEnvCache(): void {
  cachedEnv = undefined;
}

/** Public, non-secret subset safe to include in health/status responses. */
export function getPublicRuntimeInfo(): {
  nodeEnv: string;
  appUrlConfigured: boolean;
} {
  try {
    const env = getServerEnv();
    return {
      nodeEnv: env.NODE_ENV,
      appUrlConfigured: Boolean(env.APP_URL),
    };
  } catch {
    return {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      appUrlConfigured: Boolean(process.env.APP_URL),
    };
  }
}
