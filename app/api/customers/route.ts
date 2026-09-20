import { requireAuthenticatedUser } from "@/lib/authz/context";
import { createCustomer } from "@/lib/customers/create";
import { parseInput } from "@/lib/validation";
import { createCustomerSchema } from "@/lib/validation/conversations";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getActiveMembership } from "@/lib/authz/membership";
import { AuthorizationError } from "@/lib/errors";

const schema = createCustomerSchema.extend({
  organizationId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(schema, body);
    const membership = await getActiveMembership(
      auth.user.id,
      input.organizationId,
    );
    if (!membership) {
      throw new AuthorizationError(
        "You are not an active member of this organization.",
      );
    }
    const customer = await createCustomer(
      input.organizationId,
      auth.user.id,
      input,
    );
    return jsonOk({ customer }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
