import type { AiProvider, AiTextRequest, AiTextResponse } from "@/lib/ai/types";
import { ConfigurationError, AppError } from "@/lib/errors";
import { logger } from "@/lib/observability/logger";

export type AiProviderErrorCategory =
  | "AI_AUTHENTICATION_FAILED"
  | "AI_RATE_LIMITED"
  | "AI_MODEL_UNAVAILABLE"
  | "AI_BAD_REQUEST"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_EMPTY_RESPONSE"
  | "AI_INVALID_RESPONSE";

function classifyOpenAiHttpError(status: number): {
  category: AiProviderErrorCategory;
  message: string;
  statusCode: number;
} {
  if (status === 401 || status === 403) {
    return {
      category: "AI_AUTHENTICATION_FAILED",
      message:
        "AI authentication failed. Check the OpenAI API configuration.",
      statusCode: 502,
    };
  }
  if (status === 429) {
    return {
      category: "AI_RATE_LIMITED",
      message: "AI rate limit reached. Try again shortly.",
      statusCode: 429,
    };
  }
  if (status === 404) {
    return {
      category: "AI_MODEL_UNAVAILABLE",
      message: "The configured AI model is unavailable.",
      statusCode: 502,
    };
  }
  if (status >= 400 && status < 500) {
    return {
      category: "AI_BAD_REQUEST",
      message: "AI request was rejected. Try again with different input.",
      statusCode: 502,
    };
  }
  return {
    category: "AI_PROVIDER_UNAVAILABLE",
    message: "AI is temporarily unavailable. Try again shortly.",
    statusCode: 502,
  };
}

export class OpenAiProvider implements AiProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string) {
    if (!apiKey) {
      throw new ConfigurationError(
        "AI is not configured yet. Set OPENAI_API_KEY.",
      );
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
      logger.warn("ai_provider_network_failure", {
        provider: "openai",
        category: "AI_PROVIDER_UNAVAILABLE",
      });
      throw new AppError(
        "INTERNAL_ERROR",
        "AI is temporarily unavailable. Try again shortly.",
        502,
        true,
        {
          cause,
          details: { category: "AI_PROVIDER_UNAVAILABLE" },
        },
      );
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const classified = classifyOpenAiHttpError(response.status);
      logger.warn("ai_provider_http_error", {
        provider: "openai",
        category: classified.category,
        providerStatus: response.status,
        // Safe truncated snippet only — never log secrets or full prompts
        snippet: body.slice(0, 120).replace(/sk-[a-zA-Z0-9]+/g, "[redacted]"),
      });
      throw new AppError(
        "INTERNAL_ERROR",
        classified.message,
        classified.statusCode,
        true,
        {
          details: {
            category: classified.category,
            providerStatus: response.status,
          },
        },
      );
    }

    let data: {
      choices?: { message?: { content?: string } }[];
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      model?: string;
    };
    try {
      data = (await response.json()) as typeof data;
    } catch (cause) {
      logger.warn("ai_provider_invalid_json", {
        provider: "openai",
        category: "AI_INVALID_RESPONSE",
      });
      throw new AppError(
        "INTERNAL_ERROR",
        "AI returned an invalid response. Try again shortly.",
        502,
        true,
        {
          cause,
          details: { category: "AI_INVALID_RESPONSE" },
        },
      );
    }

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) {
      throw new AppError(
        "INTERNAL_ERROR",
        "AI returned an empty response. Try again shortly.",
        502,
        true,
        { details: { category: "AI_EMPTY_RESPONSE" } },
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

/** Exported for unit tests */
export { classifyOpenAiHttpError };
