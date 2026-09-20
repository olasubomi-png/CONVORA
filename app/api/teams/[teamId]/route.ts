import { requireAuthenticatedUser } from "@/lib/authz/context";
import { updateTeam, deleteTeam } from "@/lib/teams/service";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ teamId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { teamId } = await params;
    const body = await request.json();
    const input = parseInput(
      z.object({
        name: z.string().trim().min(1).max(80).optional(),
        description: z.string().max(500).nullable().optional(),
      }),
      body,
    );
    const team = await updateTeam(auth.user.id, teamId, input);
    return jsonOk({ team });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { teamId } = await params;
    await deleteTeam(auth.user.id, teamId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
