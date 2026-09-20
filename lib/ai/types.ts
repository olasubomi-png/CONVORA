import { z } from "zod";

export const generationTypes = [
  "CONVERSATION_SUMMARY",
  "CUSTOMER_SUMMARY",
  "SUGGESTED_REPLY",
  "INTENT_CLASSIFICATION",
  "SENTIMENT_ANALYSIS",
  "PRIORITY_SIGNAL",
  "FACT_EXTRACTION",
  "INTERNAL_NOTE_SUGGESTION",
] as const;

export type GenerationType = (typeof generationTypes)[number];

export const conversationSummarySchema = z.object({
  summary: z.string().min(1).max(4000),
  customerGoal: z.string().max(1000).optional(),
  unresolvedIssues: z.array(z.string().max(500)).max(20).default([]),
  nextSteps: z.array(z.string().max(500)).max(20).default([]),
});

export const customerSummarySchema = z.object({
  summary: z.string().min(1).max(4000),
  highlights: z.array(z.string().max(500)).max(20).default([]),
});

export const suggestedReplySchema = z.object({
  draft: z.string().min(1).max(8000),
  tone: z.string().max(80).optional(),
});

export const intentSchema = z.object({
  intent: z.enum([
    "SALES",
    "SUPPORT",
    "BILLING",
    "COMPLAINT",
    "GENERAL_INQUIRY",
    "OTHER",
  ]),
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().max(500).optional(),
});

export const sentimentSchema = z.object({
  sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE", "UNKNOWN"]),
  confidence: z.number().min(0).max(1).optional(),
});

export const prioritySignalSchema = z.object({
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  confidence: z.number().min(0).max(1).optional(),
  rationale: z.string().max(500).optional(),
});

export const factExtractionSchema = z.object({
  facts: z
    .array(
      z.object({
        key: z.string().max(80),
        value: z.string().max(500),
        confidence: z.number().min(0).max(1).optional(),
      }),
    )
    .max(30),
});

export const internalNoteSuggestionSchema = z.object({
  note: z.string().min(1).max(4000),
});

export type ConversationSummaryResult = z.infer<typeof conversationSummarySchema>;
export type CustomerSummaryResult = z.infer<typeof customerSummarySchema>;
export type SuggestedReplyResult = z.infer<typeof suggestedReplySchema>;
export type IntentResult = z.infer<typeof intentSchema>;
export type SentimentResult = z.infer<typeof sentimentSchema>;
export type PrioritySignalResult = z.infer<typeof prioritySignalSchema>;
export type FactExtractionResult = z.infer<typeof factExtractionSchema>;
export type InternalNoteSuggestionResult = z.infer<
  typeof internalNoteSuggestionSchema
>;

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AiTextRequest = {
  system: string;
  user: string;
  /** Optional JSON schema description for structured output. */
  jsonMode?: boolean;
};

export type AiTextResponse = {
  text: string;
  model: string;
  usage: AiUsage;
  latencyMs: number;
};

export type AiProvider = {
  readonly name: string;
  readonly model: string;
  generateText(request: AiTextRequest): Promise<AiTextResponse>;
};
