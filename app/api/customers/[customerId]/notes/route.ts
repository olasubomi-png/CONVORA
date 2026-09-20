import { requireAuthenticatedUser } from "@/lib/authz/context";
import { addCustomerNote, listCustomerNotes } from "@/lib/customers/notes";
import { parseInput } from "@/lib/validation";
import { customerNoteBodySchema } from "@/lib/validation/customers";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ customerId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    const notes = await listCustomerNotes(auth.user.id, customerId);
    return jsonOk({ notes });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { customerId } = await params;
    const body = await request.json();
    const input = parseInput(customerNoteBodySchema, body);
    const note = await addCustomerNote(auth.user.id, customerId, input.body);
    return jsonOk({ note }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
