import { requireAuthenticatedUser } from "@/lib/authz/context";
import { listOrganizationConversations } from "@/lib/conversations/list";
import { createConversation } from "@/lib/conversations/create";
import { parseInput } from "@/lib/validation";
import { createConversationSchema } from "@/lib/validation/conversations";
import { jsonError, jsonOk } from "@/lib/api/response";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) {
      const { ValidationError } = await import("@/lib/errors");
      return jsonError(new ValidationError("organizationId is required."));
    }
    const status = url.searchParams.get("status") as
      | "OPEN"
      | "PENDING"
      | "CLOSED"
      | null;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const result = await listOrganizationConversations(
      auth.user.id,
      organizationId,
      {
        status: status ?? undefined,
        cursor,
      },
    );
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(createConversationSchema, body);
    const conversation = await createConversation(
      auth.user.id,
      input.organizationId,
      input,
    );
    return jsonOk({ conversation }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
