import {
  getMetaPlatformConfig,
  type MetaOAuthProvider,
} from "@/lib/channels/meta/platform-config";
import {
  createSignedOAuthState,
  verifySignedOAuthState,
} from "@/lib/channels/meta/oauth-state";
import { META_GRAPH_API_VERSION } from "@/lib/channels/providers/meta/graph-client";
import { createFacebookInstallation } from "@/lib/channels/providers/facebook/installations";
import { createInstagramInstallation } from "@/lib/channels/providers/instagram/installations";
import { recordAuditEvent } from "@/lib/audit";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { getDatabase } from "@/db";
import { channelInstallations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { encryptJson } from "@/lib/crypto/secrets";
import { FACEBOOK_MESSENGER_PROVIDER } from "@/lib/channels/providers/facebook/adapter";
import { INSTAGRAM_MESSAGING_PROVIDER } from "@/lib/channels/providers/instagram/adapter";

const GRAPH = "https://graph.facebook.com";
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Facebook Login for Business authorization URL.
 * Permissions come from META_LOGIN_CONFIG_ID — do not append scope manually.
 */
export function buildMetaAuthorizationUrl(input: {
  provider: MetaOAuthProvider;
  state: string;
}): string {
  const config = getMetaPlatformConfig();
  if (!config) {
    throw new ConfigurationError(
      "Meta connection is not configured yet. Set META_APP_ID, META_APP_SECRET, and META_LOGIN_CONFIG_ID.",
    );
  }

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state: input.state,
    response_type: "code",
    config_id: config.loginConfigId,
  });

  return `https://www.facebook.com/${config.graphApiVersion}/dialog/oauth?${params.toString()}`;
}

export async function startMetaOAuth(input: {
  userId: string;
  organizationId: string;
  provider: MetaOAuthProvider;
}): Promise<{ authorizationUrl: string; state: string }> {
  if (!getMetaPlatformConfig()) {
    throw new ConfigurationError("Meta connection is not configured yet.");
  }
  if (
    input.provider !== "meta_messenger" &&
    input.provider !== "meta_instagram" &&
    input.provider !== "whatsapp_cloud"
  ) {
    throw new ValidationError("Unsupported Meta OAuth provider.");
  }

  const state = createSignedOAuthState(input);
  return {
    authorizationUrl: buildMetaAuthorizationUrl({
      provider: input.provider,
      state,
    }),
    state,
  };
}

async function exchangeCodeForToken(code: string): Promise<string> {
  const config = getMetaPlatformConfig();
  if (!config) {
    throw new ConfigurationError("Meta connection is not configured yet.");
  }

  const params = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    redirect_uri: config.redirectUri,
    code,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${GRAPH}/${META_GRAPH_API_VERSION}/oauth/access_token?${params.toString()}`,
      { method: "GET", signal: controller.signal },
    );
    const body = (await res.json()) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!res.ok || !body.access_token) {
      throw new ValidationError(
        body.error?.message ?? "Failed to exchange Meta authorization code.",
      );
    }
    return body.access_token;
  } finally {
    clearTimeout(timer);
  }
}

async function graphGet<T>(
  path: string,
  accessToken: string,
  query?: Record<string, string>,
): Promise<T> {
  const params = new URLSearchParams({
    access_token: accessToken,
    ...(query ?? {}),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${GRAPH}/${META_GRAPH_API_VERSION}/${path}?${params.toString()}`,
      { method: "GET", signal: controller.signal },
    );
    const body = (await res.json()) as T & {
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new ValidationError(
        body.error?.message ?? "Meta Graph API request failed.",
      );
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export type PageAccount = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string };
};

export async function listAuthorizedPages(
  userToken: string,
): Promise<PageAccount[]> {
  const data = await graphGet<{ data?: PageAccount[] }>("me/accounts", userToken, {
    fields: "id,name,access_token,instagram_business_account",
  });
  return data.data ?? [];
}

/**
 * Complete OAuth callback after signed state validation.
 * Never returns secrets to the caller.
 */
export async function completeMetaOAuth(input: {
  code: string | null;
  state: string | null;
  cookieState: string | null;
  error?: string | null;
  errorDescription?: string | null;
}): Promise<{
  organizationId: string;
  provider: MetaOAuthProvider;
  connectedCount: number;
  status: "CONNECTED" | "NEEDS_ACTION";
  message: string;
}> {
  if (input.error) {
    throw new ValidationError(
      input.errorDescription || input.error || "Meta authorization was denied.",
    );
  }
  if (!input.code || !input.state) {
    throw new ValidationError("Missing authorization code or state.");
  }
  if (!input.cookieState || input.cookieState !== input.state) {
    throw new ValidationError(
      "OAuth state cookie mismatch. Restart the connection from CONVORA.",
    );
  }

  const config = getMetaPlatformConfig();
  if (!config) {
    throw new ConfigurationError("Meta connection is not configured yet.");
  }

  const binding = verifySignedOAuthState(input.state);
  const userToken = await exchangeCodeForToken(input.code);

  let connectedCount = 0;
  let status: "CONNECTED" | "NEEDS_ACTION" = "NEEDS_ACTION";
  let message =
    "Authorization completed, but no eligible accounts were found to connect.";

  if (binding.provider === "meta_messenger") {
    const pages = await listAuthorizedPages(userToken);
    for (const page of pages) {
      if (!page.id || !page.access_token) continue;
      await upsertFacebookPage({
        actorUserId: binding.userId,
        organizationId: binding.organizationId,
        pageId: page.id,
        pageName: page.name ?? `Page ${page.id}`,
        pageAccessToken: page.access_token,
        appSecret: config.appSecret,
        verifyToken: config.webhookVerifyToken,
      });
      connectedCount += 1;
    }
    if (connectedCount > 0) {
      status = "CONNECTED";
      message = `Connected ${connectedCount} Facebook Page${connectedCount === 1 ? "" : "s"}.`;
    }
  } else if (binding.provider === "meta_instagram") {
    const pages = await listAuthorizedPages(userToken);
    for (const page of pages) {
      const igId = page.instagram_business_account?.id;
      if (!igId || !page.access_token || !page.id) continue;
      await upsertInstagramAccount({
        actorUserId: binding.userId,
        organizationId: binding.organizationId,
        instagramAccountId: igId,
        pageId: page.id,
        displayName: page.name ? `${page.name} Instagram` : `Instagram ${igId}`,
        pageAccessToken: page.access_token,
        appSecret: config.appSecret,
        verifyToken: config.webhookVerifyToken,
      });
      connectedCount += 1;
    }
    if (connectedCount > 0) {
      status = "CONNECTED";
      message = `Connected ${connectedCount} Instagram professional account${connectedCount === 1 ? "" : "s"}.`;
    } else {
      message =
        "No eligible Instagram professional account was found on your authorized Pages.";
    }
  } else {
    message =
      "WhatsApp authorization requires a WhatsApp Business Account and phone number linked in Meta Business Suite. Complete that setup, then reconnect.";
    status = "NEEDS_ACTION";
  }

  await recordAuditEvent({
    eventType: "CHANNEL_OAUTH_COMPLETED",
    actorUserId: binding.userId,
    organizationId: binding.organizationId,
    payload: {
      provider: binding.provider,
      connectedCount,
      status,
    },
  });

  return {
    organizationId: binding.organizationId,
    provider: binding.provider,
    connectedCount,
    status,
    message,
  };
}

async function upsertFacebookPage(input: {
  actorUserId: string;
  organizationId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
}) {
  const db = getDatabase();
  const existing = await db
    .select()
    .from(channelInstallations)
    .where(
      and(
        eq(channelInstallations.organizationId, input.organizationId),
        eq(channelInstallations.provider, FACEBOOK_MESSENGER_PROVIDER),
        eq(channelInstallations.providerResourceId, input.pageId),
      ),
    )
    .limit(1);

  const credentials = {
    pageAccessToken: input.pageAccessToken,
    appSecret: input.appSecret,
    verifyToken: input.verifyToken,
    pageId: input.pageId,
  };

  if (existing[0]) {
    const ciphertext = encryptJson(
      credentials as unknown as Record<string, unknown>,
    );
    await db
      .update(channelInstallations)
      .set({
        displayName: input.pageName.slice(0, 120),
        status: "ACTIVE",
        encryptedConfig: { ciphertext },
        publicConfig: { pageId: input.pageId },
        updatedAt: new Date(),
      })
      .where(eq(channelInstallations.id, existing[0].id));
    return;
  }

  await createFacebookInstallation(
    input.actorUserId,
    input.organizationId,
    {
      displayName: input.pageName.slice(0, 120),
      credentials,
    },
  );
}

async function upsertInstagramAccount(input: {
  actorUserId: string;
  organizationId: string;
  instagramAccountId: string;
  pageId: string;
  displayName: string;
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
}) {
  const db = getDatabase();
  const existing = await db
    .select()
    .from(channelInstallations)
    .where(
      and(
        eq(channelInstallations.organizationId, input.organizationId),
        eq(channelInstallations.provider, INSTAGRAM_MESSAGING_PROVIDER),
        eq(
          channelInstallations.providerResourceId,
          input.instagramAccountId,
        ),
      ),
    )
    .limit(1);

  const credentials = {
    pageAccessToken: input.pageAccessToken,
    appSecret: input.appSecret,
    verifyToken: input.verifyToken,
    instagramAccountId: input.instagramAccountId,
    pageId: input.pageId,
  };

  if (existing[0]) {
    const ciphertext = encryptJson(
      credentials as unknown as Record<string, unknown>,
    );
    await db
      .update(channelInstallations)
      .set({
        displayName: input.displayName.slice(0, 120),
        status: "ACTIVE",
        encryptedConfig: { ciphertext },
        publicConfig: {
          instagramAccountId: input.instagramAccountId,
          pageId: input.pageId,
        },
        updatedAt: new Date(),
      })
      .where(eq(channelInstallations.id, existing[0].id));
    return;
  }

  await createInstagramInstallation(
    input.actorUserId,
    input.organizationId,
    {
      displayName: input.displayName.slice(0, 120),
      credentials,
    },
  );
}

// Silence unused if tree-shaken — WhatsApp path retained for provider enum
