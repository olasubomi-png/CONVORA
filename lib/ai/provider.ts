import { getServerEnv } from "@/lib/env";
import { ConfigurationError } from "@/lib/errors";
import type { AiProvider } from "@/lib/ai/types";
import { MockAiProvider } from "@/lib/ai/providers/mock";
import { OpenAiProvider } from "@/lib/ai/providers/openai";

let cached: AiProvider | undefined;

/**
 * Resolve the configured AI provider.
 * - AI_PROVIDER=mock → MockAiProvider
 * - AI_PROVIDER=openai or OPENAI_API_KEY set → OpenAiProvider
 * - otherwise → ConfigurationError when AI is requested
 */
export function getAiProvider(): AiProvider {
  if (cached) return cached;

  const env = getServerEnv();
  if (env.AI_PROVIDER === "mock" || env.NODE_ENV === "test") {
    cached = new MockAiProvider();
    return cached;
  }

  if (env.AI_PROVIDER === "openai" || env.OPENAI_API_KEY) {
    if (!env.OPENAI_API_KEY) {
      throw new ConfigurationError(
        "OPENAI_API_KEY is required when AI_PROVIDER=openai.",
      );
    }
    cached = new OpenAiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL);
    return cached;
  }

  throw new ConfigurationError(
    "AI is not configured. Set AI_PROVIDER=mock or provide OPENAI_API_KEY.",
  );
}

export function resetAiProviderCache(): void {
  cached = undefined;
}

/** Test helper: inject a provider instance. */
export function setAiProviderForTests(provider: AiProvider): void {
  cached = provider;
}
