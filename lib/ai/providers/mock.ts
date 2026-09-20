import type { AiProvider, AiTextRequest, AiTextResponse } from "@/lib/ai/types";

/**
 * Deterministic mock for tests and local development without API keys.
 * Returns structured JSON matching the generation type hinted in the system prompt.
 */
export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  readonly model = "mock-1";

  async generateText(request: AiTextRequest): Promise<AiTextResponse> {
    const system = request.system.toLowerCase();
    let text: string;

    if (system.includes("conversation summary")) {
      text = JSON.stringify({
        summary: "Customer is asking about account access. Agent has not yet resolved the issue.",
        customerGoal: "Regain account access",
        unresolvedIssues: ["Password reset pending"],
        nextSteps: ["Verify identity", "Send reset link"],
      });
    } else if (system.includes("customer summary")) {
      text = JSON.stringify({
        summary: "Returning contact with prior support history.",
        highlights: ["Tagged VIP", "Two prior conversations"],
      });
    } else if (system.includes("suggested reply")) {
      text = JSON.stringify({
        draft:
          "Thank you for reaching out. I am looking into this and will update you shortly.",
        tone: "professional",
      });
    } else if (system.includes("intent")) {
      text = JSON.stringify({
        intent: "SUPPORT",
        confidence: 0.86,
        rationale: "Customer described an account issue.",
      });
    } else if (system.includes("sentiment")) {
      text = JSON.stringify({ sentiment: "NEUTRAL", confidence: 0.7 });
    } else if (system.includes("priority")) {
      text = JSON.stringify({
        priority: "NORMAL",
        confidence: 0.6,
        rationale: "Standard support request.",
      });
    } else if (system.includes("fact extraction")) {
      text = JSON.stringify({
        facts: [{ key: "product_interest", value: "Enterprise plan", confidence: 0.5 }],
      });
    } else if (system.includes("internal note")) {
      text = JSON.stringify({
        note: "Customer mentioned urgency around Monday deadline.",
      });
    } else {
      text = JSON.stringify({ summary: "OK" });
    }

    return {
      text,
      model: this.model,
      usage: {
        inputTokens: Math.ceil(request.system.length / 4),
        outputTokens: Math.ceil(text.length / 4),
        totalTokens: Math.ceil((request.system.length + text.length) / 4),
      },
      latencyMs: 5,
    };
  }
}
