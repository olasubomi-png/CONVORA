import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import type { MetaOAuthProvider } from "@/lib/channels/meta/platform-config";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const META_OAUTH_COOKIE = "convora_meta_oauth_state";

export type MetaOAuthStatePayload = {
  userId: string;
  organizationId: string;
  provider: MetaOAuthProvider;
  nonce: string;
  exp: number;
};

function getSigningKey(): Buffer {
  const raw = process.env.CHANNEL_SECRETS_KEY?.trim();
  if (!raw) {
    throw new ConfigurationError(
      "CHANNEL_SECRETS_KEY is not configured. Cannot sign OAuth state.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new ConfigurationError(
      "CHANNEL_SECRETS_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
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

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getSigningKey())
    .update(encodedPayload)
    .digest("base64url");
}

/**
 * Issue a signed, time-limited OAuth state bound to user + organization + provider.
 * Never log the returned token.
 */
export function createSignedOAuthState(input: {
  userId: string;
  organizationId: string;
  provider: MetaOAuthProvider;
}): string {
  const payload: MetaOAuthStatePayload = {
    userId: input.userId,
    organizationId: input.organizationId,
    provider: input.provider,
    nonce: randomBytes(16).toString("base64url"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const sig = signPayload(encodedPayload);
  return `${encodedPayload}.${sig}`;
}

/**
 * Verify signature, expiry, and structure. Does not enforce one-time use by itself —
 * the HTTP-only cookie binding + clear-on-consume provides CSRF/replay protection.
 */
export function verifySignedOAuthState(token: string): MetaOAuthStatePayload {
  if (!token || token.length < 32) {
    throw new ValidationError("Invalid OAuth state.");
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ValidationError("Invalid OAuth state.");
  }
  const [encodedPayload, sig] = parts;
  const expected = signPayload(encodedPayload);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new ValidationError("OAuth state is invalid or tampered.");
  }

  let payload: MetaOAuthStatePayload;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as MetaOAuthStatePayload;
  } catch {
    throw new ValidationError("Invalid OAuth state.");
  }

  if (
    !payload.userId ||
    !payload.organizationId ||
    !payload.provider ||
    !payload.nonce ||
    typeof payload.exp !== "number"
  ) {
    throw new ValidationError("Invalid OAuth state.");
  }
  if (payload.exp < Date.now()) {
    throw new ValidationError("OAuth state has expired.");
  }

  return {
    userId: payload.userId,
    organizationId: payload.organizationId,
    provider: assertProvider(payload.provider),
    nonce: payload.nonce,
    exp: payload.exp,
  };
}

/**
 * Cookie attributes for Meta OAuth state (HTTP-only, SameSite=Lax).
 */
export function metaOAuthCookieOptions(maxAgeSec = 600): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  const secure =
    process.env.NODE_ENV === "production" ||
    (process.env.APP_URL ?? "").startsWith("https://");
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSec,
  };
}

/** @deprecated Use createSignedOAuthState — kept for test migration aliases */
export async function createOAuthState(input: {
  userId: string;
  organizationId: string;
  provider: MetaOAuthProvider;
}): Promise<string> {
  return createSignedOAuthState(input);
}

/** @deprecated Use verifySignedOAuthState */
export async function consumeOAuthState(token: string): Promise<{
  userId: string;
  organizationId: string;
  provider: MetaOAuthProvider;
}> {
  const payload = verifySignedOAuthState(token);
  return {
    userId: payload.userId,
    organizationId: payload.organizationId,
    provider: payload.provider,
  };
}
