import { requireAuthenticatedUser } from "@/lib/authz/context";
import { resolveSuggestion } from "@/lib/ai/suggestions";
import { parseInput } from "@/lib/validation";
import { resolveSuggestionBodySchema } from "@/lib/validation/ai";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ suggestionId: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { suggestionId } = await params;
    const body = await request.json();
    const input = parseInput(resolveSuggestionBodySchema, body);
    const suggestion = await resolveSuggestion(
      auth.user.id,
      suggestionId,
      input.action,
    );
    return jsonOk({ suggestion });
  } catch (error) {
    return jsonError(error);
  }
}
