import { asc, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  webChatVisitors,
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

  const db = getDatabase();

  if (input.sessionToken) {
    const hash = hashSessionToken(input.sessionToken);
    const rows = await db
      .select()
      .from(webChatVisitors)
      .where(eq(webChatVisitors.sessionTokenHash, hash))
      .limit(1);
    const visitor = rows[0];
    if (
      visitor &&
      visitor.installationId === installation.id &&
      visitor.organizationId === installation.organizationId
    ) {
      await db
        .update(webChatVisitors)
        .set({ lastSeenAt: new Date() })
        .where(eq(webChatVisitors.id, visitor.id));
      return {
        sessionToken: input.sessionToken,
        visitor,
        installation,
        config: installation.config,
      };
    }
  }

  const sessionToken = generateSessionToken();
  const [visitor] = await db
    .insert(webChatVisitors)
    .values({
      organizationId: installation.organizationId,
      installationId: installation.id,
      sessionTokenHash: hashSessionToken(sessionToken),
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

export async function requireVisitorSession(sessionToken: string) {
  if (!sessionToken) {
    throw new AuthorizationError("Visitor session is required.");
  }
  const db = getDatabase();
  const hash = hashSessionToken(sessionToken);
  const rows = await db
    .select()
    .from(webChatVisitors)
    .where(eq(webChatVisitors.sessionTokenHash, hash))
    .limit(1);
  const visitor = rows[0];
  if (!visitor) {
    throw new NotFoundError("Visitor session not found.");
  }
  return visitor;
}

/**
 * Ensure visitor has a customer + open conversation for this installation.
 */
export async function ensureVisitorConversation(visitorId: string) {
  const db = getDatabase();
  const rows = await db
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

  return db.transaction(async (tx) => {
    let customerId = visitor.customerId;
    if (!customerId) {
      const [customer] = await tx
        .insert(customers)
        .values({
          organizationId: visitor.organizationId,
          displayName: visitor.displayName?.trim() || "Website visitor",
          email: visitor.email?.toLowerCase() ?? null,
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
      conversationId: conversationId!,
      customerId: customerId!,
    };
  });
}

export async function sendVisitorMessage(
  sessionToken: string,
  body: string,
  clientMessageId?: string,
) {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 4000) {
    throw new ValidationError("Message must be 1–4000 characters.");
  }

  const visitor = await requireVisitorSession(sessionToken);
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

  // Idempotency via metadata.clientMessageId
  if (clientMessageId) {
    const existing = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId));
    const match = existing.find(
      (m) =>
        (m.metadata as { clientMessageId?: string } | null)?.clientMessageId ===
        clientMessageId,
    );
    if (match) return match;
  }

  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(messages)
      .values({
        conversationId,
        senderType: "CUSTOMER",
        senderCustomerId: customerId,
        body: trimmed,
        messageType: "TEXT",
        metadata: clientMessageId ? { clientMessageId } : {},
      })
      .returning();
    if (!message) throw new Error("Failed to create message");

    await tx
      .update(conversations)
      .set({ lastMessageAt: message.createdAt, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return message;
  });
}

export async function listVisitorMessages(
  sessionToken: string,
  options?: { after?: string; limit?: number },
) {
  const visitor = await requireVisitorSession(sessionToken);
  if (!visitor.conversationId) {
    return { messages: [], conversationId: null };
  }

  // Verify conversation still belongs to visitor org
  const db = getDatabase();
  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, visitor.conversationId))
    .limit(1);
  if (
    !conv[0] ||
    conv[0].organizationId !== visitor.organizationId
  ) {
    throw new NotFoundError("Conversation not found.");
  }

  const limit = Math.min(Math.max(1, options?.limit ?? 50), 100);
  const rows = await db
    .select({
      id: messages.id,
      body: messages.body,
      senderType: messages.senderType,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, visitor.conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(limit);

  return {
    conversationId: visitor.conversationId,
    messages: rows.map((m) => ({
      id: m.id,
      body: m.body,
      // Do not expose internal sender membership IDs
      role: m.senderType === "CUSTOMER" ? "visitor" : "agent",
      createdAt: m.createdAt,
    })),
  };
}
