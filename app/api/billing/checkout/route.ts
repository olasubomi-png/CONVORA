import { requireAuthenticatedUser } from "@/lib/authz/context";
import { initializeCheckout } from "@/lib/billing/checkout";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";

const schema = z.object({
  organizationId: z.string().uuid(),
  planCode: z.enum(["STARTER", "PREMIUM"]),
  interval: z.enum(["MONTHLY", "YEARLY"]),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(schema, body);
    const result = await initializeCheckout({
      actorUserId: auth.user.id,
      organizationId: input.organizationId,
      planCode: input.planCode,
      interval: input.interval,
      customerEmail: auth.user.email,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
