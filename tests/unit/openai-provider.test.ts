import { describe, expect, it, vi, afterEach } from "vitest";
import {
  OpenAiProvider,
  classifyOpenAiHttpError,
} from "@/lib/ai/providers/openai";
import { ConfigurationError } from "@/lib/errors";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("classifyOpenAiHttpError", () => {
  it("maps 401 to authentication failed", () => {
    const c = classifyOpenAiHttpError(401);
    expect(c.category).toBe("AI_AUTHENTICATION_FAILED");
    expect(c.message).toMatch(/authentication/i);
  });

  it("maps 429 to rate limited", () => {
    const c = classifyOpenAiHttpError(429);
    expect(c.category).toBe("AI_RATE_LIMITED");
    expect(c.statusCode).toBe(429);
  });

  it("maps 404 to model unavailable", () => {
    expect(classifyOpenAiHttpError(404).category).toBe("AI_MODEL_UNAVAILABLE");
  });

  it("maps 500 to provider unavailable", () => {
    expect(classifyOpenAiHttpError(500).category).toBe(
      "AI_PROVIDER_UNAVAILABLE",
    );
  });
});

describe("OpenAiProvider", () => {
  it("rejects missing API key", () => {
    expect(() => new OpenAiProvider("", "gpt-4o-mini")).toThrow(
      ConfigurationError,
    );
  });

  it("maps authentication failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      }),
    );
    const p = new OpenAiProvider("sk-test", "gpt-4o-mini");
    await expect(
      p.generateText({ system: "s", user: "u" }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/authentication/i),
    });
  });

  it("maps rate limiting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "rate limit",
      }),
    );
    const p = new OpenAiProvider("sk-test", "gpt-4o-mini");
    await expect(
      p.generateText({ system: "s", user: "u" }),
    ).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringMatching(/rate limit/i),
    });
  });

  it("maps model unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "model not found",
      }),
    );
    const p = new OpenAiProvider("sk-test", "missing-model");
    await expect(
      p.generateText({ system: "s", user: "u" }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/model is unavailable/i),
    });
  });

  it("maps network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );
    const p = new OpenAiProvider("sk-test", "gpt-4o-mini");
    await expect(
      p.generateText({ system: "s", user: "u" }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/temporarily unavailable/i),
    });
  });

  it("rejects empty provider response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "" } }] }),
      }),
    );
    const p = new OpenAiProvider("sk-test", "gpt-4o-mini");
    await expect(
      p.generateText({ system: "s", user: "u" }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/empty response/i),
    });
  });

  it("rejects invalid JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("bad json");
        },
      }),
    );
    const p = new OpenAiProvider("sk-test", "gpt-4o-mini");
    await expect(
      p.generateText({ system: "s", user: "u" }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/invalid response/i),
    });
  });

  it("accepts valid JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Hello" } }],
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          model: "gpt-4o-mini",
        }),
      }),
    );
    const p = new OpenAiProvider("sk-test", "gpt-4o-mini");
    const res = await p.generateText({ system: "s", user: "u" });
    expect(res.text).toBe("Hello");
    expect(res.usage.totalTokens).toBe(3);
  });
});
