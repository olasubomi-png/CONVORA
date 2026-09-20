import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "@/lib/env";
import { ConfigurationError, ValidationError } from "@/lib/errors";

/**
 * Versioned authenticated encryption for channel credentials.
 * Format: v1:<base64(iv)>:<base64(ciphertext+tag)>
 * Algorithm: AES-256-GCM
 * Key: CHANNEL_SECRETS_KEY (32-byte key, base64-encoded)
 */

const PREFIX = "v1:";

function getKey(): Buffer {
  const env = getServerEnv();
  if (!env.CHANNEL_SECRETS_KEY) {
    throw new ConfigurationError(
      "CHANNEL_SECRETS_KEY is not configured. Cannot encrypt channel credentials.",
    );
  }
  const key = Buffer.from(env.CHANNEL_SECRETS_KEY, "base64");
  if (key.length !== 32) {
    throw new ConfigurationError(
      "CHANNEL_SECRETS_KEY must be a base64-encoded 32-byte key.",
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([encrypted, tag]);
  return `${PREFIX}${iv.toString("base64")}:${payload.toString("base64")}`;
}

export function decryptSecret(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) {
    throw new ValidationError("Unsupported ciphertext version.");
  }
  const rest = ciphertext.slice(PREFIX.length);
  const [ivB64, dataB64] = rest.split(":");
  if (!ivB64 || !dataB64) {
    throw new ValidationError("Malformed ciphertext.");
  }
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  if (data.length < 17) {
    throw new ValidationError("Malformed ciphertext.");
  }
  const tag = data.subarray(data.length - 16);
  const encrypted = data.subarray(0, data.length - 16);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ValidationError("Unable to decrypt credentials.");
  }
}

export function encryptJson(value: Record<string, unknown>): string {
  return encryptSecret(JSON.stringify(value));
}

export function decryptJson(ciphertext: string): Record<string, unknown> {
  const plain = decryptSecret(ciphertext);
  try {
    const parsed: unknown = JSON.parse(plain);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ValidationError("Invalid credential payload.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new ValidationError("Invalid credential payload.");
  }
}

export function isEncryptedCiphertext(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}
