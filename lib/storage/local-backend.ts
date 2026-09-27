import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { ObjectStorage } from "@/lib/storage/backend";
import { NotFoundError } from "@/lib/errors";

export function createLocalObjectStorage(root: string): ObjectStorage {
  return {
    name: "local",
    async put(input) {
      // Reject path traversal in storage keys
      if (
        input.storageKey.includes("..") ||
        path.isAbsolute(input.storageKey) ||
        input.storageKey.startsWith("/")
      ) {
        throw new Error("Invalid storage key.");
      }
      const abs = path.join(root, input.storageKey);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, input.bytes);
      return { storageKey: input.storageKey, byteSize: input.bytes.length };
    },
    async get(storageKey) {
      if (storageKey.includes("..") || path.isAbsolute(storageKey)) {
        throw new NotFoundError("Object not found.");
      }
      try {
        return await readFile(path.join(root, storageKey));
      } catch {
        throw new NotFoundError("Object not found.");
      }
    },
    async delete(storageKey) {
      if (storageKey.includes("..") || path.isAbsolute(storageKey)) return;
      try {
        await unlink(path.join(root, storageKey));
      } catch {
        // missing is fine
      }
    },
  };
}
