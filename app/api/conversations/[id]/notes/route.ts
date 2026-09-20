import { requireAuthenticatedUser } from "@/lib/authz/context";
import { addInternalNote, listInternalNotes } from "@/lib/conversations/notes";
import { parseInput } from "@/lib/validation";
import { noteSchema } from "@/lib/validation/conversations";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const notes = await listInternalNotes(auth.user.id, id);
    return jsonOk({ notes });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { id } = await params;
    const body = await request.json();
    const input = parseInput(noteSchema, body);
    const note = await addInternalNote(auth.user.id, id, input.body);
    return jsonOk({ note }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
