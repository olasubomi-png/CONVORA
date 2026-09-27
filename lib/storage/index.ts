import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { mediaAssets } from "@/db/schema";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  assertValidImageUpload,
  extensionForMime,
  type AllowedImageMime,
} from "@/lib/storage/image";
import { resolveObjectStorage } from "@/lib/storage/resolve";

export type MediaKind = "avatar" | "post" | "chat";
export type MediaVisibility = "public" | "private";

export {
  MAX_AVATAR_BYTES,
  MAX_POST_IMAGE_BYTES,
  MAX_CHAT_IMAGE_BYTES,
  detectImageMime,
  assertValidImageUpload,
} from "@/lib/storage/image";

export { resolveObjectStorage, resolveStorageBackendName, resetObjectStorageCache } from "@/lib/storage/resolve";

function buildStorageKey(input: {
  organizationId: string | null;
  kind: MediaKind;
  mediaId: string;
  ext: string;
}): string {
  const org = input.organizationId ?? "shared";
  // Server-generated only — never user-controlled path segments beyond UUID
  return `org/${org}/${input.kind}/${input.mediaId}.${input.ext}`;
}

/**
 * Validate, store, and record a media asset.
 * On DB failure after object write, attempts orphan cleanup.
 */
export async function storeImageAsset(input: {
  organizationId: string | null;
  kind: MediaKind;
  bytes: Buffer;
  maxBytes: number;
  visibility: MediaVisibility;
  createdByUserId?: string | null;
  originalFilename?: string | null;
  claimedMime?: string | null;
}): Promise<{
  id: string;
  storageKey: string;
  mimeType: AllowedImageMime;
  byteSize: number;
  publicPath: string;
}> {
  const mime = assertValidImageUpload({
    bytes: input.bytes,
    maxBytes: input.maxBytes,
    claimedMime: input.claimedMime,
  });

  const id = randomUUID();
  const ext = extensionForMime(mime);
  const storageKey = buildStorageKey({
    organizationId: input.organizationId,
    kind: input.kind,
    mediaId: id,
    ext,
  });

  const storage = resolveObjectStorage();
  await storage.put({
    storageKey,
    bytes: input.bytes,
    contentType: mime,
  });

  try {
    const db = getDatabase();
    const [row] = await db
      .insert(mediaAssets)
      .values({
        id,
        organizationId: input.organizationId,
        kind: input.kind,
        mimeType: mime,
        byteSize: input.bytes.length,
        storageKey,
        visibility: input.visibility,
        originalFilename: input.originalFilename?.slice(0, 200) ?? null,
        createdByUserId: input.createdByUserId ?? null,
      })
      .returning();

    if (!row) {
      throw new ValidationError("Failed to store media metadata.");
    }

    return {
      id: row.id,
      storageKey: row.storageKey,
      mimeType: mime,
      byteSize: row.byteSize,
      publicPath: `/api/media/${row.id}`,
    };
  } catch (error) {
    try {
      await storage.delete(storageKey);
    } catch {
      // orphan cleanup best-effort
    }
    throw error;
  }
}

export async function readMediaAssetBytes(mediaId: string): Promise<{
  bytes: Buffer;
  mimeType: string;
  visibility: string;
  organizationId: string | null;
  kind: string;
  createdByUserId: string | null;
}> {
  const db = getDatabase();
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);
  if (!row) {
    throw new NotFoundError("Media not found.");
  }
  const storage = resolveObjectStorage();
  const bytes = await storage.get(row.storageKey);
  return {
    bytes,
    mimeType: row.mimeType,
    visibility: row.visibility,
    organizationId: row.organizationId,
    kind: row.kind,
    createdByUserId: row.createdByUserId,
  };
}

export async function deleteMediaAsset(mediaId: string): Promise<void> {
  const db = getDatabase();
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);
  if (!row) return;
  const storage = resolveObjectStorage();
  await storage.delete(row.storageKey);
  await db.delete(mediaAssets).where(eq(mediaAssets.id, mediaId));
}

/**
 * Assert media belongs to organization (for attachment).
 */
export async function requireMediaInOrganization(
  mediaId: string,
  organizationId: string,
): Promise<{ id: string; mimeType: string; byteSize: number }> {
  const db = getDatabase();
  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, mediaId))
    .limit(1);
  if (!row || row.organizationId !== organizationId) {
    throw new NotFoundError("Media not found.");
  }
  return {
    id: row.id,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
  };
}
