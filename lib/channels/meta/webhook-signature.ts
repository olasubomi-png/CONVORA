import { verifyMetaSignature256 } from "@/lib/channels/providers/meta/crypto";
import { getMetaPlatformConfig } from "@/lib/channels/meta/platform-config";

/**
 * When the CONVORA platform Meta app is configured, verify X-Hub-Signature-256
 * against META_APP_SECRET using the exact raw body string.
 *
 * Returns:
 * - { required: false } when platform Meta is not configured (fall through to
 *   installation-scoped adapter verification).
 * - { required: true, ok: true } when signature matches platform secret.
 * - { required: true, ok: false, reason } when missing/invalid.
 *
 * Never logs secrets.
 */
export function verifyPlatformMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
):
  | { required: false }
  | { required: true; ok: true }
  | { required: true; ok: false; reason: string } {
  const config = getMetaPlatformConfig();
  if (!config) {
    return { required: false };
  }
  const result = verifyMetaSignature256(
    config.appSecret,
    rawBody,
    signatureHeader,
  );
  if (!result.ok) {
    return { required: true, ok: false, reason: result.reason };
  }
  return { required: true, ok: true };
}
