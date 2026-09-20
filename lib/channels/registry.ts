import type { ChannelAdapter } from "@/lib/channels/types";
import { MockChannelAdapter } from "@/lib/channels/adapters/mock";
import { ValidationError } from "@/lib/errors";

/**
 * Provider capability registry for **non-credentialed** adapters (e.g. mock).
 *
 * Credentialed adapters (WhatsApp Cloud, future Meta/Email) MUST be
 * construction-scoped to a single installation's credentials and passed
 * explicitly into processInboundEvent / deliverOutboundMessage.
 * Never register a credentialed adapter as a global WHATSAPP::whatsapp_cloud
 * singleton — concurrent webhooks from different orgs would race.
 */

const adapters = new Map<string, ChannelAdapter>();

function key(channel: string, provider: string): string {
  return `${channel}::${provider}`;
}

/** Register a non-credentialed adapter (tests / mock only). */
export function registerChannelAdapter(adapter: ChannelAdapter): void {
  adapters.set(key(adapter.channel, adapter.provider), adapter);
}

export function getChannelAdapter(input: {
  channel: string;
  provider: string;
}): ChannelAdapter {
  const found = adapters.get(key(input.channel, input.provider));
  if (found) return found;

  if (input.provider === "mock") {
    const adapter = new MockChannelAdapter({
      channel: input.channel as MockChannelAdapter["channel"],
      provider: "mock",
    });
    adapters.set(key(input.channel, "mock"), adapter);
    return adapter;
  }

  throw new ValidationError(
    `No channel adapter registered for ${input.channel}/${input.provider}. ` +
      "Credentialed providers must supply an installation-scoped adapter.",
  );
}

export function resetChannelAdapterRegistry(): void {
  adapters.clear();
}
