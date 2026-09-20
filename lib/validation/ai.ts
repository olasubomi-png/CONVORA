import { z } from "zod";

export const conversationAiBodySchema = z.object({
  conversationId: z.string().uuid(),
});

export const customerAiBodySchema = z.object({
  customerId: z.string().uuid(),
});

export const resolveSuggestionBodySchema = z.object({
  action: z.enum(["ACCEPT", "REJECT", "DISMISS"]),
});
