import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  setOwnPresence,
  presenceHeartbeat,
  listOrgPresence,
} from "@/lib/presence/service";
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
    const presence = await listOrgPresence(auth.user.id, organizationId);
    return jsonOk({ presence });
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
        status: z.enum(["ONLINE", "AWAY", "OFFLINE"]).optional(),
        heartbeat: z.boolean().optional(),
      }),
      body,
    );
    if (input.heartbeat) {
      const row = await presenceHeartbeat(auth.user.id, input.organizationId);
      return jsonOk({ presence: row });
    }
    if (!input.status) {
      throw new ValidationError("status is required unless heartbeat is true.");
    }
    const row = await setOwnPresence(
      auth.user.id,
      input.organizationId,
      input.status,
    );
    return jsonOk({ presence: row });
  } catch (error) {
    return jsonError(error);
  }
}
