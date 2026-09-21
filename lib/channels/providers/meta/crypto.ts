import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Meta (Facebook/Instagram) X-Hub-Signature-256 against app secret.
 * Uses constant-time comparison.
 */
export function verifyMetaSignature256(
  appSecret: string,
  rawBody: string,
  signatureHeader: string | null,
): { ok: true } | { ok: false; reason: string } {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return { ok: false, reason: "missing_signature" };
  }
  const expected =
    "sha256=" +
    createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: "invalid_signature" };
    }
  } catch {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}

export function verifyMetaChallenge(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  expectedVerifyToken: string;
}): string | null {
  if (input.mode !== "subscribe") return null;
  if (!input.token || !input.challenge) return null;
  if (input.token !== input.expectedVerifyToken) return null;
  return input.challenge;
}
