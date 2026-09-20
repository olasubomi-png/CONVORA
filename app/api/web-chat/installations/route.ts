import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  createInstallation,
  listInstallations,
} from "@/lib/web-chat/installations";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";

const createSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  allowedOrigins: z.array(z.string().url()).max(20).optional(),
  config: z
    .object({
      displayName: z.string().max(120).optional(),
      welcomeMessage: z.string().max(500).optional(),
      launcherPosition: z.enum(["bottom-right", "bottom-left"]).optional(),
      accentColor: z.string().max(20).optional(),
      headerText: z.string().max(120).optional(),
    })
    .optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const organizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    if (!organizationId) {
      throw new ValidationError("organizationId is required.");
    }
    const installations = await listInstallations(auth.user.id, organizationId);
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
    const installation = await createInstallation(
      auth.user.id,
      input.organizationId,
      input,
    );
    return jsonOk({ installation }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
