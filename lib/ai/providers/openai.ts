import type { AiProvider, AiTextRequest, AiTextResponse } from "@/lib/ai/types";
import { ConfigurationError, AppError } from "@/lib/errors";

/**
 * OpenAI Chat Completions adapter.
 * Uses fetch only — no SDK dependency required for Phase 5.
 */
export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string) {
    if (!apiKey) {
      throw new ConfigurationError("OPENAI_API_KEY is not configured.");
    }
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateText(request: AiTextRequest): Promise<AiTextResponse> {
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          response_format: request.jsonMode
            ? { type: "json_object" }
            : undefined,
          temperature: 0.2,
        }),
      });
    } catch (cause) {
      throw new AppError(
        "INTERNAL_ERROR",
        "AI provider request failed.",
        502,
        true,
        { cause },
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AppError(
        "INTERNAL_ERROR",
        "AI provider returned an error.",
        response.status === 429 ? 429 : 502,
        true,
        {
          details: {
            providerStatus: response.status,
            // Do not echo full provider body (may contain sensitive data)
            snippet: body.slice(0, 200),
          },
        },
      );
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      model?: string;
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new AppError(
        "INTERNAL_ERROR",
        "AI provider returned an empty response.",
        502,
        true,
      );
    }

    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;

    return {
      text,
      model: data.model ?? this.model,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: data.usage?.total_tokens ?? inputTokens + outputTokens,
      },
      latencyMs: Date.now() - started,
    };
  }
}
