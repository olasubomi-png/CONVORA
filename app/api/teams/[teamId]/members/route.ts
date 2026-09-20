import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  addTeamMember,
  listTeamMembers,
  removeTeamMember,
  setTeamLead,
} from "@/lib/teams/service";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";

type Params = { params: Promise<{ teamId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { teamId } = await params;
    const members = await listTeamMembers(auth.user.id, teamId);
    return jsonOk({ members });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { teamId } = await params;
    const body = await request.json();
    const input = parseInput(
      z.object({
        membershipId: z.string().uuid(),
        role: z.enum(["MEMBER", "LEAD"]).optional(),
      }),
      body,
    );
    const member = await addTeamMember(
      auth.user.id,
      teamId,
      input.membershipId,
      input.role ?? "MEMBER",
    );
    return jsonOk({ member }, 201);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { teamId } = await params;
    const body = await request.json();
    const input = parseInput(
      z.object({
        membershipId: z.string().uuid(),
        role: z.enum(["MEMBER", "LEAD"]),
      }),
      body,
    );
    const member = await setTeamLead(
      auth.user.id,
      teamId,
      input.membershipId,
      input.role === "LEAD",
    );
    return jsonOk({ member });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { teamId } = await params;
    const membershipId = new URL(request.url).searchParams.get("membershipId");
    if (!membershipId) {
      throw new ValidationError("membershipId is required.");
    }
    await removeTeamMember(auth.user.id, teamId, membershipId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
