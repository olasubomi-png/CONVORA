import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { getDatabase } from "@/db";
import { channelOauthStates } from "@/db/schema";
import { ValidationError } from "@/lib/errors";
import type { MetaOAuthProvider } from "@/lib/channels/meta/platform-config";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function hashState(token: string): string {
  return createHash("sha256").update(token).digest("hex");
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
 * Consume a one-time OAuth state. Rejects reuse, expiry, and unknown tokens.
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

  const rows = await db
    .select()
    .from(channelOauthStates)
    .where(
      and(
        eq(channelOauthStates.stateHash, stateHash),
        isNull(channelOauthStates.usedAt),
        gt(channelOauthStates.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new ValidationError("OAuth state is invalid, expired, or already used.");
  }

  const [updated] = await db
    .update(channelOauthStates)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(channelOauthStates.id, row.id),
        isNull(channelOauthStates.usedAt),
      ),
    )
    .returning();

  if (!updated) {
    throw new ValidationError("OAuth state is invalid, expired, or already used.");
  }

  return {
    userId: updated.userId,
    organizationId: updated.organizationId,
    provider: updated.provider as MetaOAuthProvider,
  };
}
