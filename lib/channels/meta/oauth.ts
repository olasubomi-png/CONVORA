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
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/channels/providers/whatsapp/adapter";
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
 * Subscribe a Facebook Page to messaging webhook fields.
 *
 * Meta Messenger API for Instagram delivers Instagram DMs through the linked
 * Facebook Page's subscribed_apps (messages field). There is no separate
 * Instagram-only Graph "subscribed_apps" path for this integration model.
 *
 * Outbound Instagram messages still use POST /{instagram-user-id}/messages
 * (see InstagramMessagingAdapter) — never the Facebook Page ID as the send path.
 *
 * Uses the Page access token. Failure → NEEDS_ACTION / ERROR, not fake CONNECTED.
 */
export async function subscribePageToMessengerWebhooks(input: {
  pageId: string;
  pageAccessToken: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const params = new URLSearchParams({
    access_token: input.pageAccessToken,
    subscribed_fields: [
      "messages",
      "messaging_postbacks",
      "message_deliveries",
      "message_reads",
      "messaging_optins",
    ].join(","),
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${GRAPH}/${META_GRAPH_API_VERSION}/${encodeURIComponent(input.pageId)}/subscribed_apps?${params.toString()}`,
      { method: "POST", signal: controller.signal },
    );
    const body = (await res.json()) as {
      success?: boolean;
      error?: { message?: string };
    };
    if (!res.ok || body.success !== true) {
      return {
        ok: false,
        reason: body.error?.message ?? "page_subscribe_failed",
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "page_subscribe_network_error" };
  } finally {
    clearTimeout(timer);
  }
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
    let needsAction = 0;
    for (const page of pages) {
      if (!page.id || !page.access_token) continue;
      const sub = await subscribePageToMessengerWebhooks({
        pageId: page.id,
        pageAccessToken: page.access_token,
      });
      const installStatus = sub.ok ? "ACTIVE" : "ERROR";
      await upsertFacebookPageInstallation({
        actorUserId: binding.userId,
        organizationId: binding.organizationId,
        pageId: page.id,
        pageName: page.name ?? `Page ${page.id}`,
        pageAccessToken: page.access_token,
        appSecret: config.appSecret,
        verifyToken: config.webhookVerifyToken,
        status: installStatus,
        subscribeError: sub.ok ? null : sub.reason,
      });
      if (sub.ok) connectedCount += 1;
      else needsAction += 1;
    }
    if (connectedCount > 0 && needsAction === 0) {
      status = "CONNECTED";
      message = `Connected ${connectedCount} Facebook Page${connectedCount === 1 ? "" : "s"}.`;
    } else if (connectedCount > 0) {
      status = "NEEDS_ACTION";
      message = `Connected ${connectedCount} Page(s); ${needsAction} still need webhook subscription in Meta.`;
    } else if (needsAction > 0) {
      status = "NEEDS_ACTION";
      message =
        "Pages were authorized but webhook subscription failed. CONVORA operators must confirm the Meta app webhook is configured.";
    }
  } else if (binding.provider === "meta_instagram") {
    const pages = await listPages(userToken);
    let needsAction = 0;
    for (const page of pages) {
      const igId = page.instagram_business_account?.id;
      if (!igId || !page.access_token || !page.id) continue;
      const sub = await subscribePageToMessengerWebhooks({
        pageId: page.id,
        pageAccessToken: page.access_token,
      });
      const installStatus = sub.ok ? "ACTIVE" : "ERROR";
      await upsertInstagramInstallation({
        actorUserId: binding.userId,
        organizationId: binding.organizationId,
        instagramAccountId: igId,
        pageId: page.id,
        displayName: page.name ? `${page.name} Instagram` : `Instagram ${igId}`,
        pageAccessToken: page.access_token,
        appSecret: config.appSecret,
        verifyToken: config.webhookVerifyToken,
        status: installStatus,
        subscribeError: sub.ok ? null : sub.reason,
      });
      if (sub.ok) connectedCount += 1;
      else needsAction += 1;
    }
    if (connectedCount > 0 && needsAction === 0) {
      status = "CONNECTED";
      message = `Connected ${connectedCount} Instagram professional account${connectedCount === 1 ? "" : "s"}.`;
    } else if (connectedCount > 0) {
      status = "NEEDS_ACTION";
      message = `Connected ${connectedCount} account(s); ${needsAction} still need webhook subscription.`;
    } else if (pages.some((p) => p.instagram_business_account?.id)) {
      status = "NEEDS_ACTION";
      message =
        "Instagram accounts were found but webhook subscription failed. Confirm the Meta app webhook configuration.";
    } else {
      message =
        "No eligible Instagram professional account was found on your authorized Pages.";
    }
  } else {
    // WhatsApp: attempt WABA / phone number discovery; stay honest if incomplete.
    const phones = await discoverWhatsAppPhoneNumbers(userToken);
    if (phones.length > 0) {
      for (const phone of phones) {
        await upsertWhatsAppInstallationFromOAuth({
          actorUserId: binding.userId,
          organizationId: binding.organizationId,
          phoneNumberId: phone.phoneNumberId,
          displayPhoneNumber: phone.displayPhoneNumber,
          accessToken: userToken,
          appSecret: config.appSecret,
          verifyToken: config.webhookVerifyToken,
        });
        connectedCount += 1;
      }
      status = "CONNECTED";
      message = `Connected ${connectedCount} WhatsApp phone number${connectedCount === 1 ? "" : "s"}.`;
    } else {
      message =
        "WhatsApp authorization requires a WhatsApp Business Account and phone number linked in Meta Business Suite. Complete that setup, then reconnect.";
      status = "NEEDS_ACTION";
    }
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
  status?: "ACTIVE" | "ERROR";
  subscribeError?: string | null;
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
        status: input.status ?? "ACTIVE",
        encryptedConfig: { ciphertext },
        publicConfig: {
          pageId: input.pageId,
          ...(input.subscribeError
            ? { needsAction: true, subscribeError: input.subscribeError }
            : {}),
        },
        updatedAt: new Date(),
      })
      .where(eq(channelInstallations.id, existing[0].id));
    return sanitizeInstallation({
      ...existing[0],
      status: input.status ?? "ACTIVE",
    });
  }

  const [row] = await db
    .insert(channelInstallations)
    .values({
      organizationId: input.organizationId,
      channel: "FACEBOOK",
      provider: FACEBOOK_MESSENGER_PROVIDER,
      displayName: input.pageName.slice(0, 120),
      status: input.status ?? "ACTIVE",
      providerResourceId: input.pageId,
      publicConfig: {
        pageId: input.pageId,
        ...(input.subscribeError
          ? { needsAction: true, subscribeError: input.subscribeError }
          : {}),
      },
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
  status?: "ACTIVE" | "ERROR";
  subscribeError?: string | null;
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
        status: input.status ?? "ACTIVE",
        encryptedConfig: { ciphertext },
        publicConfig: {
          instagramAccountId: input.instagramAccountId,
          pageId: input.pageId,
          ...(input.subscribeError
            ? { needsAction: true, subscribeError: input.subscribeError }
            : {}),
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
      status: input.status ?? "ACTIVE",
      providerResourceId: input.instagramAccountId,
      publicConfig: {
        instagramAccountId: input.instagramAccountId,
        pageId: input.pageId,
        ...(input.subscribeError
          ? { needsAction: true, subscribeError: input.subscribeError }
          : {}),
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

type WhatsAppPhone = {
  phoneNumberId: string;
  displayPhoneNumber: string;
};

/**
 * Best-effort WABA phone discovery. Returns empty when Meta does not expose
 * phone numbers on the user token (common without Embedded Signup / full WABA).
 */
async function discoverWhatsAppPhoneNumbers(
  userToken: string,
): Promise<WhatsAppPhone[]> {
  try {
    const data = await graphGet<{
      data?: Array<{
        owned_whatsapp_business_accounts?: {
          data?: Array<{
            phone_numbers?: {
              data?: Array<{ id?: string; display_phone_number?: string }>;
            };
          }>;
        };
      }>;
    }>("me/businesses", userToken, {
      fields:
        "owned_whatsapp_business_accounts{id,phone_numbers{id,display_phone_number}}",
    });
    const phones: WhatsAppPhone[] = [];
    for (const biz of data.data ?? []) {
      for (const waba of biz.owned_whatsapp_business_accounts?.data ?? []) {
        for (const phone of waba.phone_numbers?.data ?? []) {
          if (phone.id) {
            phones.push({
              phoneNumberId: phone.id,
              displayPhoneNumber: phone.display_phone_number ?? phone.id,
            });
          }
        }
      }
    }
    return phones;
  } catch {
    return [];
  }
}

async function upsertWhatsAppInstallationFromOAuth(input: {
  actorUserId: string;
  organizationId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
}) {
  const db = getDatabase();
  const ciphertext = encryptJson({
    accessToken: input.accessToken,
    appSecret: input.appSecret,
    verifyToken: input.verifyToken,
    phoneNumberId: input.phoneNumberId,
  });

  const existing = await db
    .select()
    .from(channelInstallations)
    .where(
      and(
        eq(channelInstallations.organizationId, input.organizationId),
        eq(channelInstallations.provider, WHATSAPP_CLOUD_PROVIDER),
        eq(channelInstallations.providerResourceId, input.phoneNumberId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(channelInstallations)
      .set({
        displayName: input.displayPhoneNumber.slice(0, 120),
        status: "ACTIVE",
        encryptedConfig: { ciphertext },
        publicConfig: {
          phoneNumberId: input.phoneNumberId,
          displayPhoneNumber: input.displayPhoneNumber,
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
      channel: "WHATSAPP",
      provider: WHATSAPP_CLOUD_PROVIDER,
      displayName: input.displayPhoneNumber.slice(0, 120),
      status: "ACTIVE",
      providerResourceId: input.phoneNumberId,
      publicConfig: {
        phoneNumberId: input.phoneNumberId,
        displayPhoneNumber: input.displayPhoneNumber,
      },
      encryptedConfig: { ciphertext },
    })
    .returning();
  if (!row) throw new Error("Failed to create WhatsApp installation");

  await recordAuditEvent({
    eventType: "CHANNEL_INSTALLATION_CREATED",
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    payload: {
      installationId: row.id,
      channel: "WHATSAPP",
      provider: WHATSAPP_CLOUD_PROVIDER,
    },
  });
}
