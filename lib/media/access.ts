import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  messageAttachments,
  messages,
  webChatVisitors,
} from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { getActiveMembership } from "@/lib/authz/membership";
import { NotFoundError } from "@/lib/errors";
import {
  getMediaAssetMetadata,
  readStorageObjectBytes,
  type MediaAssetMetadata,
} from "@/lib/storage";

export type AuthorizedMedia = MediaAssetMetadata & { bytes: Buffer };

/**
 * Authorize media read BEFORE loading object bytes.
 *
 * Flow:
 * 1. Load metadata from DB only
 * 2. If public → allow
 * 3. If private → membership or authorized visitor
 * 4. Only then fetch storage bytes
 *
 * Unauthorized private media always returns the same not-found error
 * so existence is not leaked.
 */
export async function authorizeMediaRead(
  mediaId: string,
  options?: { visitorToken?: string | null },
): Promise<AuthorizedMedia> {
  const meta = await getMediaAssetMetadata(mediaId);

  if (meta.visibility === "public") {
    const bytes = await readStorageObjectBytes(meta.storageKey);
    return { ...meta, bytes };
  }

  // Private media — authorize before storage access
  const allowed = await isPrivateMediaAuthorized(meta, options?.visitorToken);
  if (!allowed) {
    throw new NotFoundError("Media not found.");
  }

  const bytes = await readStorageObjectBytes(meta.storageKey);
  return { ...meta, bytes };
}

async function isPrivateMediaAuthorized(
  meta: MediaAssetMetadata,
  visitorToken?: string | null,
): Promise<boolean> {
  if (!meta.organizationId) {
    return false;
  }

  // Outside a Next.js request (e.g. unit isolation), cookie access may fail —
  // treat as unauthenticated rather than crashing.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch {
    session = null;
  }
  if (session?.user?.id) {
    const membership = await getActiveMembership(
      session.user.id,
      meta.organizationId,
    );
    if (membership) {
      return true;
    }
  }

  if (!visitorToken) {
    return false;
  }

  const tokenHash = createHash("sha256").update(visitorToken).digest("hex");
  const db = getDatabase();
  const [visitor] = await db
    .select()
    .from(webChatVisitors)
    .where(
      and(
        eq(webChatVisitors.sessionTokenHash, tokenHash),
        eq(webChatVisitors.organizationId, meta.organizationId),
      ),
    )
    .limit(1);

  if (!visitor || visitor.expiresAt < new Date()) {
    return false;
  }

  // Visitor uploaded this asset
  if (meta.createdByVisitorId === visitor.id) {
    return true;
  }

  // Media consumed by a message in the visitor's conversation
  if (visitor.conversationId && meta.consumedByMessageId) {
    const [msg] = await db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.id, meta.consumedByMessageId))
      .limit(1);
    if (msg?.conversationId === visitor.conversationId) {
      return true;
    }
  }

  // Attachment row linked to a message in the visitor's conversation
  if (visitor.conversationId) {
    const [att] = await db
      .select({ id: messageAttachments.id })
      .from(messageAttachments)
      .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
      .where(
        and(
          eq(messageAttachments.mediaAssetId, meta.id),
          eq(messages.conversationId, visitor.conversationId),
        ),
      )
      .limit(1);
    if (att) {
      return true;
    }
  }

  return false;
}
