import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { ObjectStorage } from "@/lib/storage/backend";
import {
  ConfigurationError,
  InternalError,
  NotFoundError,
} from "@/lib/errors";

export type S3StorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
};

function isS3NotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  if (e.name === "NoSuchKey" || e.name === "NotFound") return true;
  if (e.Code === "NoSuchKey" || e.Code === "NotFound") return true;
  if (e.$metadata?.httpStatusCode === 404) return true;
  return false;
}

export function createS3ObjectStorage(config: S3StorageConfig): ObjectStorage {
  const client = new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(config.endpoint
      ? {
          endpoint: config.endpoint,
          forcePathStyle: config.forcePathStyle ?? true,
        }
      : {}),
  });

  return {
    name: "s3",
    async put(input) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: input.storageKey,
            Body: input.bytes,
            ContentType: input.contentType,
          }),
        );
        return { storageKey: input.storageKey, byteSize: input.bytes.length };
      } catch (error) {
        if (error instanceof ConfigurationError) throw error;
        throw new InternalError("Media storage write failed.", {
          cause: error,
        });
      }
    },
    async get(storageKey) {
      try {
        const res = await client.send(
          new GetObjectCommand({
            Bucket: config.bucket,
            Key: storageKey,
          }),
        );
        const stream = res.Body;
        if (!stream) throw new NotFoundError("Object not found.");
        return Buffer.from(await stream.transformToByteArray());
      } catch (error) {
        if (error instanceof NotFoundError) throw error;
        if (isS3NotFound(error)) {
          throw new NotFoundError("Object not found.");
        }
        throw new InternalError("Media storage read failed.", {
          cause: error,
        });
      }
    },
    async delete(storageKey) {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: storageKey,
          }),
        );
      } catch {
        // best-effort cleanup; do not surface provider details
      }
    },
  };
}

export function readS3ConfigFromEnv(): S3StorageConfig {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim() || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new ConfigurationError(
      "Photo storage is not configured. Please contact your administrator.",
    );
  }
  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    endpoint: endpoint || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  };
}
