import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/permissions";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";
import { isMetaPlatformConfigured } from "@/lib/channels/meta/platform-config";
import { startMetaOAuth } from "@/lib/channels/meta/oauth";
import type { MetaOAuthProvider } from "@/lib/channels/meta/platform-config";
import { jsonError } from "@/lib/api/response";
import {
  AuthorizationError,
  ConfigurationError,
  ValidationError,
} from "@/lib/errors";

const PROVIDERS = new Set<MetaOAuthProvider>([
  "whatsapp_cloud",
  "meta_messenger",
  "meta_instagram",
]);

/**
 * Start Meta OAuth for a channel provider.
 * Returns a redirect to Meta, or 503 when platform Meta app is not configured.
 */
export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    const provider = url.searchParams.get("provider") as MetaOAuthProvider | null;

    if (!organizationId) {
      throw new ValidationError("organizationId is required.");
    }
    if (!provider || !PROVIDERS.has(provider)) {
      throw new ValidationError("Unsupported Meta OAuth provider.");
    }

    await requirePermission(auth.user.id, organizationId, "channels.manage");
    const membership = await getActiveMembership(auth.user.id, organizationId);
    if (!membership || !isAdminRole(membership.role)) {
      throw new AuthorizationError(
        "Only admins or owners can connect external channels.",
      );
    }

    if (!isMetaPlatformConfigured()) {
      throw new ConfigurationError(
        "Meta connection is not configured yet. Set META_APP_ID and META_APP_SECRET.",
      );
    }

    const { authorizationUrl } = await startMetaOAuth({
      userId: auth.user.id,
      organizationId,
      provider,
    });

    return NextResponse.redirect(authorizationUrl, 302);
  } catch (error) {
    return jsonError(error);
  }
}
