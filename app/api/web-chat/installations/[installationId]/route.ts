import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  updateInstallation,
  deleteInstallation,
} from "@/lib/web-chat/installations";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ installationId: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
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

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { installationId } = await params;
    const body = await request.json();
    const input = parseInput(patchSchema, body);
    const installation = await updateInstallation(
      auth.user.id,
      installationId,
      input,
    );
    return jsonOk({ installation });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { installationId } = await params;
    await deleteInstallation(auth.user.id, installationId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
