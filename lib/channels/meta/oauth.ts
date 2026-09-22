import { getDatabase } from "@/db";
import { channelInstallations } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/audit";
import { encryptJson } from "@/lib/crypto/secrets";
import {
  getMetaPlatformConfig,
  META_OAUTH_SCOPES,
  type MetaOAuthProvider,
} from "@/lib/channels/meta/platform-config";
import { createOAuthState, consumeOAuthState } from "@/lib/channels/meta/oauth-state";
import { META_GRAPH_API_VERSION } from "@/lib/channels/providers/meta/graph-client";
import { FACEBOOK_MESSENGER_PROVIDER } from "@/lib/channels/providers/facebook/adapter";
import { INSTAGRAM_MESSAGING_PROVIDER } from "@/lib/channels/providers/instagram/adapter";
import { ConfigurationError, ValidationError } from "@/lib/errors";
import { sanitizeInstallation } from "@/lib/channels/installations";

const GRAPH = "https://graph.facebook.com";
const FETCH_TIMEOUT_MS = 15_000;

export function buildMetaAuthorizationUrl(input: {
  provider: MetaOAuthProvider;
  state: string;
}): string {
  const config = getMetaPlatformConfig();
  if (!config) {
    throw new ConfigurationError(
      "Meta connection is not configured yet. Set META_APP_ID and META_APP_SECRET.",
    );
  }

  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state: input.state,
    scope: META_OAUTH_SCOPES[input.provider],
    response_type: "code",
  });

  return `https://www.facebook.com/${config.graphApiVersion}/dialog/oauth?${params.toString()}`;
}

export async function startMetaOAuth(input: {
  userId: string;
  organizationId: string;
  provider: MetaOAuthProvider;
}): Promise<{ authorizationUrl: string }> {
  if (!getMetaPlatformConfig()) {
    throw new ConfigurationError(
      "Meta connection is not configured yet.",
    );
  }
  const state = await createOAuthState(input);
  return {
    authorizationUrl: buildMetaAuthorizationUrl({
      provider: input.provider,
      state,
    }),
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

type PageAccount = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id: string };
};

async function listPages(userToken: string): Promise<PageAccount[]> {
  const data = await graphGet<{ data?: PageAccount[] }>("me/accounts", userToken, {
    fields: "id,name,access_token,instagram_business_account",
  });
  return data.data ?? [];
}

/**
 * Complete OAuth callback: validate state, exchange code, persist installations.
 * Never returns secrets to the caller.
 */
export async function completeMetaOAuth(input: {
  code: string | null;
  state: string | null;
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

  const config = getMetaPlatformConfig();
  if (!config) {
    throw new ConfigurationError("Meta connection is not configured yet.");
  }

  const binding = await consumeOAuthState(input.state);
  const userToken = await exchangeCodeForToken(input.code);

  let connectedCount = 0;
  let status: "CONNECTED" | "NEEDS_ACTION" = "NEEDS_ACTION";
  let message =
    "Authorization completed, but no eligible accounts were found to connect.";

  if (binding.provider === "meta_messenger") {
    const pages = await listPages(userToken);
    for (const page of pages) {
      if (!page.id || !page.access_token) continue;
      await upsertFacebookPageInstallation({
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
    const pages = await listPages(userToken);
    for (const page of pages) {
      const igId = page.instagram_business_account?.id;
      if (!igId || !page.access_token || !page.id) continue;
      await upsertInstagramInstallation({
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
    // WhatsApp Cloud: user token alone is not enough without WABA / phone_number_id.
    // Store an ERROR installation marker only when we cannot complete connection.
    message =
      "WhatsApp authorization requires a WhatsApp Business Account and phone number linked in Meta. Complete WhatsApp Business setup in Meta Business Suite, then reconnect.";
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

async function upsertFacebookPageInstallation(input: {
  actorUserId: string;
  organizationId: string;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  appSecret: string;
  verifyToken: string;
}) {
  const db = getDatabase();
  const ciphertext = encryptJson({
    pageAccessToken: input.pageAccessToken,
    appSecret: input.appSecret,
    verifyToken: input.verifyToken,
    pageId: input.pageId,
  });

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

  if (existing[0]) {
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
    return sanitizeInstallation({ ...existing[0], status: "ACTIVE" });
  }

  const [row] = await db
    .insert(channelInstallations)
    .values({
      organizationId: input.organizationId,
      channel: "FACEBOOK",
      provider: FACEBOOK_MESSENGER_PROVIDER,
      displayName: input.pageName.slice(0, 120),
      status: "ACTIVE",
      providerResourceId: input.pageId,
      publicConfig: { pageId: input.pageId },
      encryptedConfig: { ciphertext },
    })
    .returning();
  if (!row) throw new Error("Failed to create Facebook installation");

  await recordAuditEvent({
    eventType: "CHANNEL_INSTALLATION_CREATED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    payload: {
      installationId: row.id,
      channel: "FACEBOOK",
      provider: FACEBOOK_MESSENGER_PROVIDER,
    },
  });

  return sanitizeInstallation(row);
}

async function upsertInstagramInstallation(input: {
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
  const ciphertext = encryptJson({
    pageAccessToken: input.pageAccessToken,
    appSecret: input.appSecret,
    verifyToken: input.verifyToken,
    instagramAccountId: input.instagramAccountId,
    pageId: input.pageId,
  });

  const existing = await db
    .select()
    .from(channelInstallations)
    .where(
      and(
        eq(channelInstallations.organizationId, input.organizationId),
        eq(channelInstallations.provider, INSTAGRAM_MESSAGING_PROVIDER),
        eq(channelInstallations.providerResourceId, input.instagramAccountId),
      ),
    )
    .limit(1);

  if (existing[0]) {
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

  const [row] = await db
    .insert(channelInstallations)
    .values({
      organizationId: input.organizationId,
      channel: "INSTAGRAM",
      provider: INSTAGRAM_MESSAGING_PROVIDER,
      displayName: input.displayName.slice(0, 120),
      status: "ACTIVE",
      providerResourceId: input.instagramAccountId,
      publicConfig: {
        instagramAccountId: input.instagramAccountId,
        pageId: input.pageId,
      },
      encryptedConfig: { ciphertext },
    })
    .returning();
  if (!row) throw new Error("Failed to create Instagram installation");

  await recordAuditEvent({
    eventType: "CHANNEL_INSTALLATION_CREATED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    payload: {
      installationId: row.id,
      channel: "INSTAGRAM",
      provider: INSTAGRAM_MESSAGING_PROVIDER,
    },
  });
}
