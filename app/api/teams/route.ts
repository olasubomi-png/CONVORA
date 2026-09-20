import { requireAuthenticatedUser } from "@/lib/authz/context";
import { createTeam, listTeams } from "@/lib/teams/service";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const organizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    if (!organizationId) throw new ValidationError("organizationId is required.");
    const teams = await listTeams(auth.user.id, organizationId);
    return jsonOk({ teams });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(
      z.object({
        organizationId: z.string().uuid(),
        name: z.string().trim().min(1).max(80),
        description: z.string().max(500).optional(),
      }),
      body,
    );
    const team = await createTeam(auth.user.id, input.organizationId, input);
    return jsonOk({ team }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
