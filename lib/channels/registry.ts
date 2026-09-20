import type { ChannelAdapter } from "@/lib/channels/types";
import { MockChannelAdapter } from "@/lib/channels/adapters/mock";
import { ValidationError } from "@/lib/errors";

const adapters = new Map<string, ChannelAdapter>();

function key(channel: string, provider: string): string {
  return `${channel}::${provider}`;
}

/** Register an adapter instance (tests / future provider boot). */
export function registerChannelAdapter(adapter: ChannelAdapter): void {
  adapters.set(key(adapter.channel, adapter.provider), adapter);
}

export function getChannelAdapter(input: {
  channel: string;
  provider: string;
}): ChannelAdapter {
  const found = adapters.get(key(input.channel, input.provider));
  if (found) return found;

  // Default mock for provider "mock" — used in tests and local simulation
  if (input.provider === "mock") {
    const adapter = new MockChannelAdapter({
      channel: input.channel as MockChannelAdapter["channel"],
      provider: "mock",
    });
    adapters.set(key(input.channel, "mock"), adapter);
    return adapter;
  }

  throw new ValidationError(
    `No channel adapter registered for ${input.channel}/${input.provider}.`,
  );
}

export function resetChannelAdapterRegistry(): void {
  adapters.clear();
}
