import { del, get, put } from "@vercel/blob";
import type { ObjectStorage, StoredObject } from "@/lib/storage/backend";
import { ConfigurationError, InternalError } from "@/lib/errors";

function requireBlobToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();

  if (!token) {
    throw new ConfigurationError(
      "Vercel Blob storage is not configured. Please contact your administrator.",
    );
  }

  return token;
}

export function createVercelBlobObjectStorage(): ObjectStorage {
  return {
    name: "vercel_blob",

    async put(input): Promise<StoredObject> {
      const token = requireBlobToken();

      try {
        const blob = await put(input.storageKey, input.bytes, {
          access: "private",
          contentType: input.contentType,
          token,
          addRandomSuffix: false,
        });

        return {
          storageKey: blob.pathname,
          byteSize: input.bytes.length,
        };
      } catch {
        throw new InternalError("Media storage write failed.");
      }
    },

    async get(storageKey): Promise<Buffer> {
      const token = requireBlobToken();

      try {
        const result = await get(storageKey, {
          access: "private",
          token,
        });

        if (!result || result.statusCode !== 200) {
          throw new Error("Blob not found.");
        }

        const reader = result.stream.getReader();
        const chunks: Uint8Array[] = [];

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) break;
            if (value) chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }

        return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
      } catch {
        throw new InternalError("Media storage read failed.");
      }
    },

    async delete(storageKey): Promise<void> {
      const token = requireBlobToken();

      try {
        await del(storageKey, { token });
      } catch {
        throw new InternalError("Media storage delete failed.");
      }
    },
  };
}
