import { requireAuthenticatedUser } from "@/lib/authz/context";
import { createWhatsAppInstallation } from "@/lib/channels/providers/whatsapp/installations";
import { listChannelInstallations } from "@/lib/channels/installations";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/channels/providers/whatsapp/adapter";

const createSchema = z.object({
  organizationId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(120),
  credentials: z.object({
    accessToken: z.string().min(10).max(500),
    appSecret: z.string().min(8).max(200),
    verifyToken: z.string().min(8).max(200),
    phoneNumberId: z.string().min(1).max(64),
    businessAccountId: z.string().max(64).optional(),
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
    const all = await listChannelInstallations(auth.user.id, organizationId);
    const installations = all.filter(
      (i) => i.provider === WHATSAPP_CLOUD_PROVIDER,
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
    const installation = await createWhatsAppInstallation(
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
