import type { ChannelAdapter } from "@/lib/channels/types";
import { getChannelAdapter } from "@/lib/channels/registry";
import {
  WhatsAppCloudAdapter,
  WHATSAPP_CLOUD_PROVIDER,
} from "@/lib/channels/providers/whatsapp/adapter";
import { loadWhatsAppCredentials } from "@/lib/channels/providers/whatsapp/installations";
import type { channelInstallations } from "@/db/schema";

/**
 * Build an installation-scoped adapter.
 * Credentialed providers decrypt secrets for this installation only.
 */
export function resolveInstallationAdapter(
  installation: typeof channelInstallations.$inferSelect,
): ChannelAdapter {
  if (
    installation.channel === "WHATSAPP" &&
    installation.provider === WHATSAPP_CLOUD_PROVIDER
  ) {
    const credentials = loadWhatsAppCredentials(installation);
    return new WhatsAppCloudAdapter(credentials);
  }

  // Non-credentialed mock / registered adapters
  return getChannelAdapter({
    channel: installation.channel,
    provider: installation.provider,
  });
}
