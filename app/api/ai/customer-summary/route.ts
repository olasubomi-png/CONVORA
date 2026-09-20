import { requireAuthenticatedUser } from "@/lib/authz/context";
import { generateCustomerSummary } from "@/lib/ai/generate";
import { parseInput } from "@/lib/validation";
import { customerAiBodySchema } from "@/lib/validation/ai";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(customerAiBodySchema, body);
    const result = await generateCustomerSummary(auth.user.id, input.customerId);
    return jsonOk({
      generationId: result.generation.id,
      result: result.result,
    });
  } catch (error) {
    return jsonError(error);
  }
}
