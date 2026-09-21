import { requireAuthenticatedUser } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/permissions";
import { createFacebookInstallation } from "@/lib/channels/providers/facebook/installations";
import { listChannelInstallations } from "@/lib/channels/installations";
import { FACEBOOK_MESSENGER_PROVIDER } from "@/lib/channels/providers/facebook/adapter";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";

const createSchema = z.object({
  organizationId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(120),
  credentials: z.object({
    pageAccessToken: z.string().min(20).max(1000),
    appSecret: z.string().min(8).max(200),
    verifyToken: z.string().min(8).max(200),
    pageId: z.string().min(1).max(64),
  }),
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
    await requirePermission(auth.user.id, organizationId, "channels.view");
    const all = await listChannelInstallations(auth.user.id, organizationId);
    const installations = all.filter(
      (i) => i.provider === FACEBOOK_MESSENGER_PROVIDER,
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
    await requirePermission(
      auth.user.id,
      input.organizationId,
      "channels.manage",
    );
    const installation = await createFacebookInstallation(
      auth.user.id,
      input.organizationId,
      {
        displayName: input.displayName,
        credentials: input.credentials,
      },
    );
    return jsonOk({ installation }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
