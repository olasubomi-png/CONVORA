import { verifyMetaChallenge } from "@/lib/channels/providers/meta/crypto";
import { getMetaPlatformConfig } from "@/lib/channels/meta/platform-config";

/**
 * Accept Meta webhook challenges against:
 * 1) Platform META_WEBHOOK_VERIFY_TOKEN (when configured)
 * 2) Per-installation verify tokens (caller supplies matches)
 *
 * Never returns secrets.
 */
export function verifyMetaWebhookChallenge(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  installationVerifyTokens?: string[];
}): string | null {
  const platform = getMetaPlatformConfig();
  if (platform) {
    const platformMatch = verifyMetaChallenge({
      mode: input.mode,
      token: input.token,
      challenge: input.challenge,
      expectedVerifyToken: platform.webhookVerifyToken,
    });
    if (platformMatch !== null) return platformMatch;
  }

  for (const expected of input.installationVerifyTokens ?? []) {
    const match = verifyMetaChallenge({
      mode: input.mode,
      token: input.token,
      challenge: input.challenge,
      expectedVerifyToken: expected,
    });
    if (match !== null) return match;
  }
  return null;
}
