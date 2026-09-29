import { and, asc, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  webChatVisitors,
  webChatInstallations,
  webChatMessageIdempotency,
  customers,
  conversations,
  messages,
  conversationParticipants,
} from "@/db/schema";
import {
  resolveActiveInstallationByPublicKey,
  assertOriginAllowed,
} from "@/lib/web-chat/installations";
import {
  generateSessionToken,
  hashSessionToken,
} from "@/lib/web-chat/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  NotFoundError,
  ValidationError,
  RateLimitError,
  AuthorizationError,
} from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  enqueueAutomationEvent,
  flushAutomationEvents,
} from "@/lib/automation/dispatch";
import {
  notifyAgentsOfCustomerMessage,
  flushNotificationDeliveries,
} from "@/lib/notifications/notify";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sessionExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + SESSION_TTL_MS);
}

async function loadVisitorByToken(sessionToken: string) {
  const db = getDatabase();
  const hash = hashSessionToken(sessionToken);
  const rows = await db
    .select()
    .from(webChatVisitors)
    .where(eq(webChatVisitors.sessionTokenHash, hash))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Require a valid, non-expired visitor session whose installation is ACTIVE.
 */
export async function requireVisitorSession(sessionToken: string) {
  if (!sessionToken) {
    throw new AuthorizationError("Visitor session is required.");
  }
  const visitor = await loadVisitorByToken(sessionToken);
  if (!visitor) {
    throw new NotFoundError("Visitor session not found.");
  }
  if (visitor.expiresAt.getTime() <= Date.now()) {
    throw new AuthorizationError("Visitor session has expired.");
  }

  const db = getDatabase();
  const [installation] = await db
    .select()
    .from(webChatInstallations)
    .where(eq(webChatInstallations.id, visitor.installationId))
    .limit(1);
  if (!installation || installation.status !== "ACTIVE") {
    throw new NotFoundError("Installation not found.");
  }
  if (installation.organizationId !== visitor.organizationId) {
    throw new NotFoundError("Visitor session not found.");
  }

  return { visitor, installation };
}

export async function createOrResumeVisitorSession(input: {
  publicKey: string;
  origin: string | null;
  sessionToken?: string | null;
}) {
  const installation = await resolveActiveInstallationByPublicKey(
    input.publicKey,
  );
  assertOriginAllowed(installation, input.origin);

  const rl = checkRateLimit({
    key: `wc:session:${installation.id}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    throw new RateLimitError("Too many session requests.");
  }

  // Invalid-key probing is also limited globally per key prefix
  checkRateLimit({
    key: `wc:key:${input.publicKey.slice(0, 16)}`,
    limit: 120,
    windowMs: 60_000,
  });

  const db = getDatabase();

  if (input.sessionToken) {
    const visitor = await loadVisitorByToken(input.sessionToken);
    if (
      visitor &&
      visitor.installationId === installation.id &&
      visitor.organizationId === installation.organizationId &&
      visitor.expiresAt.getTime() > Date.now()
    ) {
      const expiresAt = sessionExpiresAt();
      await db
        .update(webChatVisitors)
        .set({ lastSeenAt: new Date(), expiresAt })
        .where(eq(webChatVisitors.id, visitor.id));
      return {
        sessionToken: input.sessionToken,
        visitor: { ...visitor, expiresAt },
        installation,
        config: installation.config,
      };
    }
    // Token invalid/expired/wrong installation → create new (do not revive)
  }

  const sessionToken = generateSessionToken();
  const [visitor] = await db
    .insert(webChatVisitors)
    .values({
      organizationId: installation.organizationId,
      installationId: installation.id,
      sessionTokenHash: hashSessionToken(sessionToken),
      expiresAt: sessionExpiresAt(),
    })
    .returning();
  if (!visitor) throw new Error("Failed to create visitor");

  return {
    sessionToken,
    visitor,
    installation,
    config: installation.config,
  };
}

/**
 * Ensure visitor has customer + conversation. Uses row lock to prevent races.
 */
export async function ensureVisitorConversation(visitorId: string) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM web_chat_visitors WHERE id = ${visitorId} FOR UPDATE`,
    );

    const rows = await tx
      .select()
      .from(webChatVisitors)
      .where(eq(webChatVisitors.id, visitorId))
      .limit(1);
    const visitor = rows[0];
    if (!visitor) throw new NotFoundError("Visitor session not found.");

    if (visitor.conversationId && visitor.customerId) {
      return {
        visitor,
        conversationId: visitor.conversationId,
        customerId: visitor.customerId,
      };
    }

    let customerId = visitor.customerId;
    if (!customerId) {
      const [customer] = await tx
        .insert(customers)
        .values({
          organizationId: visitor.organizationId,
          displayName: visitor.displayName?.trim() || "New visitor",
          email: visitor.email ? visitor.email.trim().toLowerCase() : null,
        })
        .returning();
      if (!customer) throw new Error("Failed to create customer");
      customerId = customer.id;
    }

    let conversationId = visitor.conversationId;
    if (!conversationId) {
      const [conversation] = await tx
        .insert(conversations)
        .values({
          organizationId: visitor.organizationId,
          customerId,
          channel: "WEB",
          status: "OPEN",
          subject: "Web chat",
        })
        .returning();
      if (!conversation) throw new Error("Failed to create conversation");
      conversationId = conversation.id;

      await tx.insert(conversationParticipants).values({
        conversationId,
        role: "CUSTOMER",
        customerId,
      });
    }

    const [updated] = await tx
      .update(webChatVisitors)
      .set({
        customerId,
        conversationId,
        lastSeenAt: new Date(),
      })
      .where(eq(webChatVisitors.id, visitorId))
      .returning();

    return {
      visitor: updated ?? visitor,
      conversationId,
      customerId,
    };
  });
}

export async function sendVisitorMessage(
  sessionToken: string,
  body: string,
  clientMessageId?: string,
  mediaId?: string,
) {
  const trimmed = body.trim();
  if ((!trimmed && !mediaId) || trimmed.length > 4000) {
    throw new ValidationError("Message must include text and/or an image.");
  }
  const messageBody = trimmed || (mediaId ? "[image]" : "");


  const { visitor } = await requireVisitorSession(sessionToken);

  const rl = checkRateLimit({
    key: `wc:msg:${visitor.id}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!rl.allowed) {
    throw new RateLimitError("Too many messages. Please wait.");
  }

  const { conversationId, customerId } = await ensureVisitorConversation(
    visitor.id,
  );

  const db = getDatabase();

  if (clientMessageId) {
    // Fast path: existing idempotency row
    const existing = await db
      .select()
      .from(webChatMessageIdempotency)
      .where(
        and(
          eq(webChatMessageIdempotency.conversationId, conversationId),
          eq(webChatMessageIdempotency.clientMessageId, clientMessageId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      const [msg] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, existing[0].messageId))
        .limit(1);
      if (msg) return msg;
    }
  }

  try {
    const messageResult = await db.transaction(async (tx) => {
      const [message] = await tx
        .insert(messages)
        .values({
          conversationId,
          senderType: "CUSTOMER",
          senderCustomerId: customerId,
          body: messageBody,
          messageType: mediaId ? "IMAGE" : "TEXT",
          metadata: clientMessageId ? { clientMessageId } : {},
        })
        .returning();
      if (!message) throw new Error("Failed to create message");

      if (mediaId) {
        const {
          requireVisitorMediaAttach,
          markMediaConsumed,
        } = await import("@/lib/storage");
        const { messageAttachments } = await import("@/db/schema");
        const media = await requireVisitorMediaAttach(
          mediaId,
          visitor.organizationId,
          visitor.id,
        );
        await tx.insert(messageAttachments).values({
          messageId: message.id,
          organizationId: visitor.organizationId,
          mediaAssetId: media.id,
          mimeType: media.mimeType,
          byteSize: media.byteSize,
        });
        await markMediaConsumed(tx, media.id, message.id);
      }

      await enqueueAutomationEvent(
        {
          organizationId: visitor.organizationId,
          triggerType: "conversation.message_received",
          eventKey: `message:${message.id}:received`,
          payload: {
            conversationId,
            customerId,
            message: { direction: "inbound", body: messageBody.slice(0, 200) },
          },
        },
        tx,
      );

      if (clientMessageId) {
        await tx.insert(webChatMessageIdempotency).values({
          organizationId: visitor.organizationId,
          conversationId,
          clientMessageId,
          messageId: message.id,
        });
      }

      await tx
        .update(conversations)
        .set({ lastMessageAt: message.createdAt, updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      return message;
    });
    await flushAutomationEvents(visitor.organizationId);
    // In-app notification rows are written quickly; push/email are async inside notify
    try {
      await notifyAgentsOfCustomerMessage({
        organizationId: visitor.organizationId,
        conversationId,
        messageId: messageResult.id,
        customerId,
        channel: "WEB",
        preview: messageBody,
      });
      // Process due push jobs; delayed email jobs wait until availableAt
      await flushNotificationDeliveries(visitor.organizationId);
    } catch {
      // Notification failures must not fail message delivery
    }
    return messageResult;
  } catch (error) {
    if (clientMessageId && isUniqueViolation(error)) {
      const existing = await db
        .select()
        .from(webChatMessageIdempotency)
        .where(
          and(
            eq(webChatMessageIdempotency.conversationId, conversationId),
            eq(webChatMessageIdempotency.clientMessageId, clientMessageId),
          ),
        )
        .limit(1);
      if (existing[0]) {
        const [msg] = await db
          .select()
          .from(messages)
          .where(eq(messages.id, existing[0].messageId))
          .limit(1);
        if (msg) return msg;
      }
    }
    throw error;
  }
}

export async function listVisitorMessages(
  sessionToken: string,
  options?: { afterId?: string; limit?: number },
) {
  const { visitor } = await requireVisitorSession(sessionToken);
  if (!visitor.conversationId) {
    return { messages: [] as const, conversationId: null as string | null };
  }

  const db = getDatabase();
  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, visitor.conversationId))
    .limit(1);
  if (!conv[0] || conv[0].organizationId !== visitor.organizationId) {
    throw new NotFoundError("Conversation not found.");
  }

  const limit = Math.min(Math.max(1, options?.limit ?? 50), 100);
  const conditions = [eq(messages.conversationId, visitor.conversationId)];

  if (options?.afterId) {
    const [anchor] = await db
      .select({ createdAt: messages.createdAt, id: messages.id })
      .from(messages)
      .where(eq(messages.id, options.afterId))
      .limit(1);
    if (anchor) {
      conditions.push(
        sql`(${messages.createdAt} > ${anchor.createdAt} OR (${messages.createdAt} = ${anchor.createdAt} AND ${messages.id} > ${anchor.id}))`,
      );
    }
  }

  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      senderType: messages.senderType,
      createdAt: messages.createdAt,
      deliveredAt: messages.deliveredAt,
      seenAt: messages.seenAt,
    })
    .from(messages)
    .where(and(...conditions))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(limit);

  const messageIds = rows.map((m) => m.id);
  const attachmentMap: Record<
    string,
    Array<{ id: string; mediaUrl: string; mimeType: string }>
  > = {};
  if (messageIds.length > 0) {
    const { messageAttachments } = await import("@/db/schema");
    const { inArray } = await import("drizzle-orm");
    const atts = await db
      .select({
        id: messageAttachments.id,
        messageId: messageAttachments.messageId,
        mediaAssetId: messageAttachments.mediaAssetId,
        mimeType: messageAttachments.mimeType,
      })
      .from(messageAttachments)
      .where(inArray(messageAttachments.messageId, messageIds));
    for (const a of atts) {
      if (!attachmentMap[a.messageId]) attachmentMap[a.messageId] = [];
      attachmentMap[a.messageId]!.push({
        id: a.id,
        mediaUrl: `/api/media/${a.mediaAssetId}`,
        mimeType: a.mimeType,
      });
    }
  }

  return {
    conversationId: visitor.conversationId,
    messages: rows.map((m) => ({
      id: m.id,
      body: m.body,
      role: m.senderType === "CUSTOMER" ? ("visitor" as const) : ("agent" as const),
      createdAt: m.createdAt,
      deliveredAt: m.deliveredAt,
      seenAt: m.seenAt,
      attachments: attachmentMap[m.id] ?? [],
    })),
  };
}

/**
 * Persist visitor identity from the authenticated session token.
 * Never accepts client-supplied customerId.
 */
export async function setVisitorIdentity(
  sessionToken: string,
  input: {
    displayName: string;
    email?: string | null;
    avatarUrl?: string | null;
  },
) {
  const name = input.displayName.trim().replace(/\s+/g, " ");
  if (name.length < 2) {
    throw new ValidationError("Please enter your name (at least 2 characters).");
  }
  if (name.length > 120) {
    throw new ValidationError("Name is too long.");
  }

  let email: string | null = null;
  if (input.email != null && String(input.email).trim() !== "") {
    email = String(input.email).trim().toLowerCase();
    if (email.length > 254) {
      throw new ValidationError("Email is too long.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ValidationError("Please enter a valid email address.");
    }
  }

  const { visitor } = await requireVisitorSession(sessionToken);
  const db = getDatabase();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM web_chat_visitors WHERE id = ${visitor.id} FOR UPDATE`,
    );

    const [locked] = await tx
      .select()
      .from(webChatVisitors)
      .where(eq(webChatVisitors.id, visitor.id))
      .limit(1);
    if (!locked) throw new NotFoundError("Visitor session not found.");

    await tx
      .update(webChatVisitors)
      .set({
        displayName: name,
        email: email ?? locked.email,
        lastSeenAt: new Date(),
        expiresAt: sessionExpiresAt(),
      })
      .where(eq(webChatVisitors.id, locked.id));

    let customerId = locked.customerId;

    if (customerId) {
      const patch: {
        displayName: string;
        email?: string | null;
        avatarUrl?: string | null;
        updatedAt: Date;
      } = {
        displayName: name,
        updatedAt: new Date(),
      };
      if (email) patch.email = email;
      if (input.avatarUrl !== undefined) {
        patch.avatarUrl = input.avatarUrl;
      }
      try {
        await tx
          .update(customers)
          .set(patch)
          .where(
            and(
              eq(customers.id, customerId),
              eq(customers.organizationId, locked.organizationId),
            ),
          );
      } catch (err) {
        if (email && isUniqueViolation(err)) {
          // Keep name; leave email unchanged on customer if conflict
          await tx
            .update(customers)
            .set({ displayName: name, updatedAt: new Date() })
            .where(
              and(
                eq(customers.id, customerId),
                eq(customers.organizationId, locked.organizationId),
              ),
            );
        } else {
          throw err;
        }
      }
    } else {
      // Prefer linking to existing org customer with same email
      if (email) {
        const [existing] = await tx
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.organizationId, locked.organizationId),
              eq(customers.email, email),
              eq(customers.status, "ACTIVE"),
            ),
          )
          .limit(1);
        if (existing) {
          customerId = existing.id;
          await tx
            .update(customers)
            .set({ displayName: name, updatedAt: new Date() })
            .where(eq(customers.id, existing.id));
        }
      }

      if (!customerId) {
        try {
          const [created] = await tx
            .insert(customers)
            .values({
              organizationId: locked.organizationId,
              displayName: name,
              email,
              avatarUrl: input.avatarUrl ?? null,
            })
            .returning();
          if (!created) throw new Error("Failed to create customer");
          customerId = created.id;
        } catch (err) {
          if (email && isUniqueViolation(err)) {
            const [existing] = await tx
              .select()
              .from(customers)
              .where(
                and(
                  eq(customers.organizationId, locked.organizationId),
                  eq(customers.email, email),
                  eq(customers.status, "ACTIVE"),
                ),
              )
              .limit(1);
            if (existing) {
              customerId = existing.id;
              await tx
                .update(customers)
                .set({ displayName: name, updatedAt: new Date() })
                .where(eq(customers.id, existing.id));
            } else {
              const [created] = await tx
                .insert(customers)
                .values({
                  organizationId: locked.organizationId,
                  displayName: name,
                  email: null,
                })
                .returning();
              if (!created) throw new Error("Failed to create customer");
              customerId = created.id;
            }
          } else {
            throw err;
          }
        }
      }

      await tx
        .update(webChatVisitors)
        .set({ customerId })
        .where(eq(webChatVisitors.id, locked.id));
    }

    return {
      displayName: name,
      email: email ?? locked.email,
      customerId: customerId!,
      visitorId: locked.id,
    };
  }).then(async (result) => {
    const ensured = await ensureVisitorConversation(result.visitorId);
    return {
      displayName: result.displayName,
      email: result.email,
      customerId: ensured.customerId,
      conversationId: ensured.conversationId,
    };
  });
}
