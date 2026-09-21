import type { ChannelAdapter } from "@/lib/channels/types";
import { getChannelAdapter } from "@/lib/channels/registry";
import {
  WhatsAppCloudAdapter,
  WHATSAPP_CLOUD_PROVIDER,
} from "@/lib/channels/providers/whatsapp/adapter";
import { loadWhatsAppCredentials } from "@/lib/channels/providers/whatsapp/installations";
import {
  FacebookMessengerAdapter,
  FACEBOOK_MESSENGER_PROVIDER,
} from "@/lib/channels/providers/facebook/adapter";
import { loadFacebookCredentials } from "@/lib/channels/providers/facebook/installations";
import {
  InstagramMessagingAdapter,
  INSTAGRAM_MESSAGING_PROVIDER,
} from "@/lib/channels/providers/instagram/adapter";
import { loadInstagramCredentials } from "@/lib/channels/providers/instagram/installations";
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

  if (
    installation.channel === "FACEBOOK" &&
    installation.provider === FACEBOOK_MESSENGER_PROVIDER
  ) {
    const credentials = loadFacebookCredentials(installation);
    return new FacebookMessengerAdapter(credentials);
  }

  if (
    installation.channel === "INSTAGRAM" &&
    installation.provider === INSTAGRAM_MESSAGING_PROVIDER
  ) {
    const credentials = loadInstagramCredentials(installation);
    return new InstagramMessagingAdapter(credentials);
  }

  // Non-credentialed mock / registered adapters
  return getChannelAdapter({
    channel: installation.channel,
    provider: installation.provider,
  });
}
