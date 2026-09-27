import path from "node:path";
import type { ObjectStorage } from "@/lib/storage/backend";
import { createLocalObjectStorage } from "@/lib/storage/local-backend";
import {
  createS3ObjectStorage,
  readS3ConfigFromEnv,
} from "@/lib/storage/s3-backend";
import { ConfigurationError } from "@/lib/errors";

export type StorageBackendName = "local" | "s3";

/**
 * Resolve object storage backend.
 *
 * - development/test default: local
 * - production default: s3 (must be configured)
 * - explicit MEDIA_STORAGE_BACKEND=local|s3 overrides
 *
 * Never silently falls back from s3 to local.
 */
export function resolveStorageBackendName(): StorageBackendName {
  const explicit = process.env.MEDIA_STORAGE_BACKEND?.trim().toLowerCase();
  if (explicit === "local" || explicit === "s3") {
    return explicit;
  }
  if (process.env.NODE_ENV === "production") {
    return "s3";
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
