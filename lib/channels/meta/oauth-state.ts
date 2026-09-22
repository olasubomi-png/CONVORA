import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { getDatabase } from "@/db";
import { channelOauthStates } from "@/db/schema";
import { ValidationError } from "@/lib/errors";
import type { MetaOAuthProvider } from "@/lib/channels/meta/platform-config";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const META_OAUTH_PROVIDERS = [
  "whatsapp_cloud",
  "meta_messenger",
  "meta_instagram",
] as const;

function hashState(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function assertProvider(value: string): MetaOAuthProvider {
  if (
    value === "whatsapp_cloud" ||
    value === "meta_messenger" ||
    value === "meta_instagram"
  ) {
    return value;
  }
  throw new ValidationError("OAuth state provider is invalid.");
}

/**
 * Issue a one-time OAuth state bound to user + organization + provider.
 * Returns the opaque token for the browser redirect (never log it).
 */
export async function createOAuthState(input: {
  userId: string;
  organizationId: string;
  provider: MetaOAuthProvider;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const stateHash = hashState(token);
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);

  const db = getDatabase();
  await db.insert(channelOauthStates).values({
    stateHash,
    userId: input.userId,
    organizationId: input.organizationId,
    provider: input.provider,
    expiresAt,
  });

  return token;
}

/**
 * Atomically consume a one-time OAuth state.
 *
 * Uses a single conditional UPDATE … RETURNING so concurrent callers cannot
 * both mark the same state as used. Rejects unknown, expired, and already-used
 * tokens. Organization/user/provider come only from the stored row.
 */
export async function consumeOAuthState(token: string): Promise<{
  userId: string;
  organizationId: string;
  provider: MetaOAuthProvider;
}> {
  if (!token || token.length < 16) {
    throw new ValidationError("Invalid OAuth state.");
  }

  const stateHash = hashState(token);
  const db = getDatabase();
  const now = new Date();

  const updated = await db
    .update(channelOauthStates)
    .set({ usedAt: now })
    .where(
      and(
        eq(channelOauthStates.stateHash, stateHash),
        isNull(channelOauthStates.usedAt),
        gt(channelOauthStates.expiresAt, now),
      ),
    )
    .returning({
      userId: channelOauthStates.userId,
      organizationId: channelOauthStates.organizationId,
      provider: channelOauthStates.provider,
    });

  const row = updated[0];
  if (!row) {
    throw new ValidationError(
      "OAuth state is invalid, expired, or already used.",
    );
  }

  return {
    userId: row.userId,
    organizationId: row.organizationId,
    provider: assertProvider(row.provider),
  };
}

/**
 * Test helper: insert an already-expired unused state for expiry tests.
 */
export async function createExpiredOAuthStateForTests(input: {
  userId: string;
  organizationId: string;
  provider: MetaOAuthProvider;
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const stateHash = hashState(token);
  const db = getDatabase();
  await db.insert(channelOauthStates).values({
    stateHash,
    userId: input.userId,
    organizationId: input.organizationId,
    provider: input.provider,
    expiresAt: new Date(Date.now() - 60_000),
  });
  return token;
}

/** Expose hash for concurrent tests only. */
export function hashOAuthStateTokenForTests(token: string): string {
  return hashState(token);
}
