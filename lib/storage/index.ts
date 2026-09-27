import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "@/db";
import { mediaAssets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  assertValidImageUpload,
  extensionForMime,
  type AllowedImageMime,
} from "@/lib/storage/image";

export type MediaKind = "avatar" | "post" | "chat";
export type MediaVisibility = "public" | "private";

function storageRoot(): string {
  return (
    process.env.MEDIA_STORAGE_PATH?.trim() ||
    path.join(process.cwd(), ".data", "media")
  );
}

/**
 * Persist an image to local storage and record metadata.
 * Provider-agnostic: local filesystem today; storage_key can map to blob later.
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
  const orgPart = input.organizationId ?? "public";
  const storageKey = `${input.kind}/${orgPart}/${id}.${ext}`;
  const abs = path.join(storageRoot(), storageKey);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, input.bytes);

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
}

export async function readMediaAssetBytes(mediaId: string): Promise<{
  bytes: Buffer;
  mimeType: string;
  visibility: string;
  organizationId: string | null;
  kind: string;
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
  const abs = path.join(storageRoot(), row.storageKey);
  const bytes = await readFile(abs);
  return {
    bytes,
    mimeType: row.mimeType,
    visibility: row.visibility,
    organizationId: row.organizationId,
    kind: row.kind,
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
  try {
    await unlink(path.join(storageRoot(), row.storageKey));
  } catch {
    // ignore missing file
  }
  await db.delete(mediaAssets).where(eq(mediaAssets.id, mediaId));
}

/** Content hash helper for idempotent tests */
export function hashBytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export {
  MAX_AVATAR_BYTES,
  MAX_POST_IMAGE_BYTES,
  MAX_CHAT_IMAGE_BYTES,
  detectImageMime,
  assertValidImageUpload,
} from "@/lib/storage/image";
