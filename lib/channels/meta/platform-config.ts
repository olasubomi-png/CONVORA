import { META_GRAPH_API_VERSION } from "@/lib/channels/providers/meta/graph-client";

export type MetaPlatformConfig = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  webhookVerifyToken: string;
  graphApiVersion: string;
  /** Facebook Login for Business configuration ID */
  loginConfigId: string;
};

/**
 * Server-only Meta platform application configuration.
 * When incomplete, channel connect must report NOT CONFIGURED — never fake success.
 *
 * Requires:
 * - META_APP_ID
 * - META_APP_SECRET
 * - APP_URL (or META_REDIRECT_URI)
 * - META_LOGIN_CONFIG_ID (or META_CONFIG_ID / META_FACEBOOK_LOGIN_CONFIG_ID)
 */
export function getMetaPlatformConfig(): MetaPlatformConfig | null {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  const appUrl = process.env.APP_URL?.trim();
  const loginConfigId =
    process.env.META_LOGIN_CONFIG_ID?.trim() ||
    process.env.META_CONFIG_ID?.trim() ||
    process.env.META_FACEBOOK_LOGIN_CONFIG_ID?.trim();

  if (!appId || !appSecret || !appUrl || !loginConfigId) {
    return null;
  }

  const redirectUri =
    process.env.META_REDIRECT_URI?.trim() ||
    `${appUrl.replace(/\/$/, "")}/api/channels/meta/oauth/callback`;

  const webhookVerifyToken =
    process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() ||
    `convora_verify_${appId.slice(0, 8)}`;

  return {
    appId,
    appSecret,
    redirectUri,
    webhookVerifyToken,
    graphApiVersion: META_GRAPH_API_VERSION,
    loginConfigId,
  };
}

export function isMetaPlatformConfigured(): boolean {
  return getMetaPlatformConfig() !== null;
}

export type MetaOAuthProvider =
  | "whatsapp_cloud"
  | "meta_messenger"
  | "meta_instagram";

/**
 * @deprecated Prefer Login for Business config_id — scopes come from Meta configuration.
 * Kept for documentation of historical manual-scope flow only.
 */
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
