import { requireAuthenticatedUser } from "@/lib/authz/context";
import { createCustomer } from "@/lib/customers/create";
import { listCustomers } from "@/lib/customers/list";
import { parseInput } from "@/lib/validation";
import { createCustomerBodySchema } from "@/lib/validation/customers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) {
      throw new ValidationError("organizationId is required.");
    }
    const q = url.searchParams.get("q") ?? undefined;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const result = await listCustomers(auth.user.id, organizationId, {
      q,
      cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(createCustomerBodySchema, body);
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
