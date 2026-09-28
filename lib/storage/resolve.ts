import path from "node:path";
import type { ObjectStorage } from "@/lib/storage/backend";
import { createLocalObjectStorage } from "@/lib/storage/local-backend";
import {
  createS3ObjectStorage,
  readS3ConfigFromEnv,
} from "@/lib/storage/s3-backend";
import { ConfigurationError } from "@/lib/errors";
import { createVercelBlobObjectStorage } from "@/lib/storage/vercel-blob-backend";

export type StorageBackendName = "local" | "s3" | "vercel_blob";

/**
 * Resolve object storage backend.
 *
 * - development/test default: local
 * - production default: vercel_blob (must be configured)
 * - explicit MEDIA_STORAGE_BACKEND=local|s3|vercel_blob overrides
 *
 * Never silently falls back from a configured production backend to local.
 */
export function resolveStorageBackendName(): StorageBackendName {
  const explicit = process.env.MEDIA_STORAGE_BACKEND?.trim().toLowerCase();
  if (explicit === "local" || explicit === "s3" || explicit === "vercel_blob") {
    return explicit;
  }
  if (process.env.NODE_ENV === "production") {
    return "vercel_blob";
  }
  return "local";
}

let cached: ObjectStorage | null = null;

export function resolveObjectStorage(): ObjectStorage {
  if (cached) return cached;
  const name = resolveStorageBackendName();
  if (name === "s3") {
    cached = createS3ObjectStorage(readS3ConfigFromEnv());
    return cached;
  }

  if (name === "vercel_blob") {
    cached = createVercelBlobObjectStorage();
    return cached;
  }
  if (process.env.NODE_ENV === "production" && name !== "local") {
    throw new ConfigurationError("Invalid media storage backend.");
  }
  const root =
    process.env.MEDIA_STORAGE_PATH?.trim() ||
    path.join(process.cwd(), ".data", "media");
  cached = createLocalObjectStorage(root);
  return cached;
}

/** Test helper — clear cached backend between tests */
export function resetObjectStorageCache(): void {
  cached = null;
}
