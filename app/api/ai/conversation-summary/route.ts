import { requireAuthenticatedUser } from "@/lib/authz/context";
import { generateConversationSummary } from "@/lib/ai/generate";
import { parseInput } from "@/lib/validation";
import { conversationAiBodySchema } from "@/lib/validation/ai";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(conversationAiBodySchema, body);
    const result = await generateConversationSummary(
      auth.user.id,
      input.conversationId,
    );
    return jsonOk({
      generationId: result.generation.id,
      result: result.result,
      usage: {
        inputTokens: result.generation.inputTokens,
        outputTokens: result.generation.outputTokens,
        totalTokens: result.generation.totalTokens,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
