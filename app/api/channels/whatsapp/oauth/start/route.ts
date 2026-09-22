import { requireAuthenticatedUser } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/permissions";
import { jsonError } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";

/**
 * Starts Meta OAuth / Embedded Signup for WhatsApp when platform credentials exist.
 * Agents never supply tokens. Returns 503 until platform Meta app is fully configured.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const organizationId = new URL(request.url).searchParams.get(
      "organizationId",
    );
    if (!organizationId) {
      throw new ValidationError("organizationId is required.");
    }
    await requirePermission(auth.user.id, organizationId, "channels.manage");

    const appId = process.env.META_APP_ID ?? process.env.WHATSAPP_META_APP_ID;
    if (!appId) {
      return new Response(
        JSON.stringify({
          error: {
            code: "META_NOT_CONFIGURED",
            message:
              "WhatsApp authorization is not available until the CONVORA platform Meta application is configured.",
          },
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    return new Response(
      JSON.stringify({
        error: {
          code: "META_OAUTH_PENDING_PLATFORM_CONFIG",
          message:
            "Meta application id is present but complete Embedded Signup configuration is not finished on this deployment.",
        },
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return jsonError(error);
  }
}
