import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  mediaAssets,
  messageAttachments,
  messages,
  webChatVisitors,
} from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { getActiveMembership } from "@/lib/authz/membership";
import { NotFoundError } from "@/lib/errors";
import { readMediaAssetBytes } from "@/lib/storage";

/**
 * Authorize read of a media asset.
 * - public: open
 * - private: active org membership OR web-chat visitor that owns/received it
 */
export async function authorizeMediaRead(
  mediaId: string,
  options?: { visitorToken?: string | null },
) {
  const asset = await readMediaAssetBytes(mediaId);
  if (asset.visibility === "public") {
    return asset;
  }

  const session = await getSession();
  if (session?.user?.id && asset.organizationId) {
    const membership = await getActiveMembership(
      session.user.id,
      asset.organizationId,
    );
    if (membership) {
      return asset;
    }
  }

  const visitorToken = options?.visitorToken;
  if (visitorToken && asset.organizationId) {
    const tokenHash = createHash("sha256").update(visitorToken).digest("hex");
    const db = getDatabase();
    const [visitor] = await db
      .select()
      .from(webChatVisitors)
      .where(
        and(
          eq(webChatVisitors.sessionTokenHash, tokenHash),
          eq(webChatVisitors.organizationId, asset.organizationId),
        ),
      )
      .limit(1);

    if (visitor && visitor.expiresAt >= new Date()) {
      // Uploader can always read their own unconsumed/consumed media
      if (true) {
        const [meta] = await db
          .select({
            createdByVisitorId: mediaAssets.createdByVisitorId,
            consumedByMessageId: mediaAssets.consumedByMessageId,
          })
          .from(mediaAssets)
          .where(eq(mediaAssets.id, mediaId))
          .limit(1);

        if (meta?.createdByVisitorId === visitor.id) {
          return asset;
        }

        // Or media attached to a message in the visitor's conversation
        if (visitor.conversationId && meta?.consumedByMessageId) {
          const [msg] = await db
            .select({ conversationId: messages.conversationId })
            .from(messages)
            .where(eq(messages.id, meta.consumedByMessageId))
            .limit(1);
          if (msg?.conversationId === visitor.conversationId) {
            return asset;
          }
        }

        // Attachment row in visitor conversation
        if (visitor.conversationId) {
          const [att] = await db
            .select({ id: messageAttachments.id })
            .from(messageAttachments)
            .innerJoin(
              messages,
              eq(messages.id, messageAttachments.messageId),
            )
            .where(
              and(
                eq(messageAttachments.mediaAssetId, mediaId),
                eq(messages.conversationId, visitor.conversationId),
              ),
            )
            .limit(1);
          if (att) {
            return asset;
          }
        }
      }
    }
  }

  throw new NotFoundError("Media not found.");
}
