import { requireAuthenticatedUser } from "@/lib/authz/context";
import { generateFactExtraction } from "@/lib/ai/generate";
import { parseInput } from "@/lib/validation";
import { conversationAiBodySchema } from "@/lib/validation/ai";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(conversationAiBodySchema, body);
    const result = await generateFactExtraction(
      auth.user.id,
      input.conversationId,
    );
    return jsonOk({
      generationId: result.generation.id,
      suggestionId: result.suggestion?.id ?? null,
      result: result.result,
    });
  } catch (error) {
    return jsonError(error);
  }
}
