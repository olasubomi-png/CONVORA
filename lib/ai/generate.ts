import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { aiGenerations, aiSuggestions } from "@/db/schema";
import { getAiProvider } from "@/lib/ai/provider";
import { PROMPT_SECURITY_PREAMBLE } from "@/lib/ai/prompts";
import {
  loadConversationAiContext,
  loadCustomerAiContext,
} from "@/lib/ai/context";
import {
  conversationSummarySchema,
  customerSummarySchema,
  suggestedReplySchema,
  intentSchema,
  sentimentSchema,
  prioritySignalSchema,
  factExtractionSchema,
  internalNoteSuggestionSchema,
  type GenerationType,
} from "@/lib/ai/types";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  RateLimitError,
  ValidationError,
  AppError,
} from "@/lib/errors";
import type { z } from "zod";

function parseJsonResult(schema: z.ZodTypeAny, text: string): Record<string, unknown> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    // Try to extract JSON object from model prose
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new ValidationError("AI returned invalid structured output.");
    }
    try {
      raw = JSON.parse(match[0]);
    } catch {
      throw new ValidationError("AI returned invalid structured output.");
    }
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("AI output failed schema validation.");
  }
  return parsed.data as Record<string, unknown>;
}

async function enforceAiRateLimit(
  organizationId: string,
  actorUserId: string,
) {
  const result = await checkRateLimit({
    key: `ai:${organizationId}:${actorUserId}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!result.allowed) {
    throw new RateLimitError("AI rate limit exceeded. Try again shortly.");
  }
}

type GenerateArgs = {
  actorUserId: string;
  generationType: GenerationType;
  conversationId?: string;
  customerId?: string;
  systemTask: string;
  userPayload: string;
  schema: z.ZodTypeAny;
  persistSuggestion?: boolean;
};

async function runGeneration(args: GenerateArgs) {
  const provider = getAiProvider();

  // Resolve org + membership via conversation or customer context
  let organizationId: string;
  let membershipId: string;
  const conversationId: string | null = args.conversationId ?? null;
  let customerId: string | null = args.customerId ?? null;

  if (args.conversationId) {
    const ctx = await loadConversationAiContext(
      args.actorUserId,
      args.conversationId,
    );
    organizationId = ctx.conversation.organizationId;
    membershipId = ctx.membership.id;
    customerId = ctx.conversation.customerId;
  } else if (args.customerId) {
    const ctx = await loadCustomerAiContext(args.actorUserId, args.customerId);
    organizationId = ctx.customer.organizationId;
    membershipId = ctx.membership.id;
  } else {
    throw new ValidationError("conversationId or customerId is required.");
  }

  await enforceAiRateLimit(organizationId, args.actorUserId);

  const db = getDatabase();
  const [generation] = await db
    .insert(aiGenerations)
    .values({
      organizationId,
      actorUserId: args.actorUserId,
      actorMembershipId: membershipId,
      conversationId,
      customerId,
      provider: provider.name,
      model: provider.model,
      generationType: args.generationType,
      status: "PENDING",
    })
    .returning();

  if (!generation) throw new Error("Failed to create AI generation");

  await recordAuditEvent({
    eventType: "AI_GENERATION_REQUESTED",
    actorUserId: args.actorUserId,
    organizationId,
    payload: {
      generationId: generation.id,
      generationType: args.generationType,
      conversationId: conversationId ?? undefined,
      customerId: customerId ?? undefined,
    },
  });

  try {
    const response = await provider.generateText({
      system: `${PROMPT_SECURITY_PREAMBLE}\n\nTask: ${args.systemTask}`,
      user: args.userPayload,
      jsonMode: true,
    });

    const result = parseJsonResult(args.schema, response.text);

    const [updated] = await db
      .update(aiGenerations)
      .set({
        status: "SUCCEEDED",
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        totalTokens: response.usage.totalTokens,
        latencyMs: response.latencyMs,
        model: response.model,
        result,
        completedAt: new Date(),
      })
      .where(eq(aiGenerations.id, generation.id))
      .returning();

    await recordAuditEvent({
      eventType: "AI_GENERATION_SUCCEEDED",
      actorUserId: args.actorUserId,
      organizationId,
      payload: {
        generationId: generation.id,
        generationType: args.generationType,
      },
    });

    let suggestion = null;
    if (args.persistSuggestion) {
      const [s] = await db
        .insert(aiSuggestions)
        .values({
          organizationId,
          generationId: generation.id,
          conversationId,
          customerId,
          suggestionType: args.generationType,
          status: "PENDING",
          content: result,
        })
        .returning();
      suggestion = s ?? null;
    }

    return {
      generation: updated ?? generation,
      result,
      suggestion,
    };
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : "AI generation failed.";
    await db
      .update(aiGenerations)
      .set({
        status: "FAILED",
        errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR",
        errorMessage: message.slice(0, 500),
        completedAt: new Date(),
      })
      .where(eq(aiGenerations.id, generation.id));

    await recordAuditEvent({
      eventType: "AI_GENERATION_FAILED",
      actorUserId: args.actorUserId,
      organizationId,
      payload: {
        generationId: generation.id,
        generationType: args.generationType,
        errorCode: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      },
    });

    throw error;
  }
}

export async function generateConversationSummary(
  actorUserId: string,
  conversationId: string,
) {
  const ctx = await loadConversationAiContext(actorUserId, conversationId);
  return runGeneration({
    actorUserId,
    generationType: "CONVERSATION_SUMMARY",
    conversationId,
    systemTask:
      "conversation summary. Produce JSON with summary, customerGoal, unresolvedIssues, nextSteps.",
    userPayload: `Customer: ${ctx.customer?.displayName ?? "Unknown"}\n\nTranscript:\n${ctx.transcript}`,
    schema: conversationSummarySchema,
  });
}

export async function generateCustomerSummary(
  actorUserId: string,
  customerId: string,
) {
  const ctx = await loadCustomerAiContext(actorUserId, customerId);
  return runGeneration({
    actorUserId,
    generationType: "CUSTOMER_SUMMARY",
    customerId,
    systemTask:
      "customer summary. Produce JSON with summary and highlights. Mark interpretations as AI-generated, not verified facts.",
    userPayload: `${ctx.profileBlock}\n\n${ctx.notesBlock}`,
    schema: customerSummarySchema,
  });
}

export async function generateSuggestedReply(
  actorUserId: string,
  conversationId: string,
) {
  const ctx = await loadConversationAiContext(actorUserId, conversationId);
  return runGeneration({
    actorUserId,
    generationType: "SUGGESTED_REPLY",
    conversationId,
    systemTask:
      "suggested reply. Produce JSON with draft and optional tone. This is a draft for a human agent; do not address the system.",
    userPayload: `Transcript:\n${ctx.transcript}`,
    schema: suggestedReplySchema,
    persistSuggestion: true,
  });
}

export async function generateIntent(
  actorUserId: string,
  conversationId: string,
) {
  const ctx = await loadConversationAiContext(actorUserId, conversationId);
  return runGeneration({
    actorUserId,
    generationType: "INTENT_CLASSIFICATION",
    conversationId,
    systemTask:
      "intent classification. Produce JSON with intent (SALES|SUPPORT|BILLING|COMPLAINT|GENERAL_INQUIRY|OTHER), confidence, rationale.",
    userPayload: ctx.transcript,
    schema: intentSchema,
  });
}

export async function generateSentiment(
  actorUserId: string,
  conversationId: string,
) {
  const ctx = await loadConversationAiContext(actorUserId, conversationId);
  return runGeneration({
    actorUserId,
    generationType: "SENTIMENT_ANALYSIS",
    conversationId,
    systemTask:
      "sentiment analysis. Produce JSON with sentiment (POSITIVE|NEUTRAL|NEGATIVE|UNKNOWN) and confidence. Informational only.",
    userPayload: ctx.transcript,
    schema: sentimentSchema,
  });
}

export async function generatePrioritySignal(
  actorUserId: string,
  conversationId: string,
) {
  const ctx = await loadConversationAiContext(actorUserId, conversationId);
  return runGeneration({
    actorUserId,
    generationType: "PRIORITY_SIGNAL",
    conversationId,
    systemTask:
      "priority signal. Produce JSON with priority (LOW|NORMAL|HIGH|URGENT), confidence, rationale. This is a suggestion only and must not overwrite human priority.",
    userPayload: ctx.transcript,
    schema: prioritySignalSchema,
  });
}

export async function generateFactExtraction(
  actorUserId: string,
  conversationId: string,
) {
  const ctx = await loadConversationAiContext(actorUserId, conversationId);
  return runGeneration({
    actorUserId,
    generationType: "FACT_EXTRACTION",
    conversationId,
    systemTask:
      "fact extraction. Produce JSON with facts: [{key, value, confidence}]. Facts are unverified AI suggestions.",
    userPayload: ctx.transcript,
    schema: factExtractionSchema,
    persistSuggestion: true,
  });
}

export async function generateInternalNoteSuggestion(
  actorUserId: string,
  conversationId: string,
) {
  const ctx = await loadConversationAiContext(actorUserId, conversationId);
  return runGeneration({
    actorUserId,
    generationType: "INTERNAL_NOTE_SUGGESTION",
    conversationId,
    systemTask:
      "internal note suggestion. Produce JSON with note. Draft only; human must confirm before saving as an official note.",
    userPayload: ctx.transcript,
    schema: internalNoteSuggestionSchema,
    persistSuggestion: true,
  });
}
