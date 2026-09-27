import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { ObjectStorage } from "@/lib/storage/backend";
import { ConfigurationError, NotFoundError } from "@/lib/errors";

export type S3StorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle?: boolean;
};

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
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: input.storageKey,
          Body: input.bytes,
          ContentType: input.contentType,
        }),
      );
      return { storageKey: input.storageKey, byteSize: input.bytes.length };
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
        const bytes = Buffer.from(await stream.transformToByteArray());
        return bytes;
      } catch (error) {
        if (error instanceof NotFoundError) throw error;
        throw new NotFoundError("Object not found.");
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
        // ignore
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
      "S3 media storage is not configured. Set S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.",
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
