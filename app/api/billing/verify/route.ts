import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getActiveMembership } from "@/lib/authz/membership";
import { verifyAndActivatePayment } from "@/lib/billing/activate";
import { getDatabase } from "@/db";
import { paymentTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";
import { AuthorizationError, NotFoundError } from "@/lib/errors";

const schema = z.object({
  reference: z.string().min(8).max(100),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(schema, body);

    const db = getDatabase();
    const [payment] = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.reference, input.reference))
      .limit(1);
    if (!payment) {
      throw new NotFoundError("Payment not found.");
    }

    const membership = await getActiveMembership(
      auth.user.id,
      payment.organizationId,
    );
    if (!membership) {
      throw new AuthorizationError(
        "You are not an active member of this organization.",
      );
    }

    const result = await verifyAndActivatePayment(input.reference);
    return jsonOk({
      paid: "paid" in result ? result.paid : true,
      alreadyProcessed: result.alreadyProcessed,
      status: result.payment.status,
      planCode: result.payment.planCode,
      interval: result.payment.billingInterval,
      organizationId: result.organizationId,
    });
  } catch (error) {
    return jsonError(error);
  }
}
