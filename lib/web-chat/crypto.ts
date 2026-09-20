import { createHash, randomBytes } from "node:crypto";

export function generatePublicKey(): string {
  return `wc_${randomBytes(16).toString("hex")}`;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
