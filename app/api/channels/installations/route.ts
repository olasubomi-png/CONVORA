import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  createChannelInstallation,
  listChannelInstallations,
} from "@/lib/channels/installations";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";

const createSchema = z.object({
  organizationId: z.string().uuid(),
  channel: z.enum([
    "WEB",
    "WHATSAPP",
    "FACEBOOK",
    "INSTAGRAM",
    "EMAIL",
    "SMS",
    "OTHER",
  ]),
  provider: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(120),
  publicConfig: z.record(z.unknown()).optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const organizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    if (!organizationId) throw new ValidationError("organizationId is required.");
    const installations = await listChannelInstallations(
      auth.user.id,
      organizationId,
    );
    return jsonOk({ installations });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(createSchema, body);
    const installation = await createChannelInstallation(
      auth.user.id,
      input.organizationId,
      input,
    );
    return jsonOk({ installation }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
