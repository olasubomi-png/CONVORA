import { META_GRAPH_API_VERSION } from "@/lib/channels/providers/meta/graph-client";

export type MetaPlatformConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
};

/**
 * Server-only Meta platform application configuration.
 * When incomplete, channel connect must report NOT CONFIGURED — never fake success.
 */
export function getMetaPlatformConfig(): MetaPlatformConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const appUrl = process.env.APP_URL?.trim();
  if (!appId || !appSecret || !appUrl) {
    return null;
  }

  const redirectUri =
    process.env.META_REDIRECT_URI?.trim() ||
    `${appUrl.replace(/\/$/, "")}/api/channels/meta/oauth/callback`;

  const webhookVerifyToken =
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
    // Fallback only for local/dev when operators have not set a dedicated token.
    // Production should set META_WEBHOOK_VERIFY_TOKEN explicitly.
    `convora_verify_${appId.slice(0, 8)}`;

  return {
    appId,
    appSecret,
    redirectUri,
    webhookVerifyToken,
    graphApiVersion: META_GRAPH_API_VERSION,
  };
}

export function isMetaPlatformConfigured(): boolean {
  return getMetaPlatformConfig() !== null;
}

export type MetaOAuthProvider =
  | "whatsapp_cloud"
  | "meta_messenger"
  | "meta_instagram";

export const META_OAUTH_SCOPES: Record<MetaOAuthProvider, string> = {
  whatsapp_cloud: [
    "whatsapp_business_management",
    "whatsapp_business_messaging",
    "business_management",
  ].join(","),
  meta_messenger: [
    "pages_show_list",
    "pages_messaging",
    "pages_manage_metadata",
    "pages_read_engagement",
  ].join(","),
  meta_instagram: [
    "pages_show_list",
    "pages_messaging",
    "pages_manage_metadata",
    "instagram_basic",
    "instagram_manage_messages",
  ].join(","),
};
