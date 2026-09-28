/**
 * Provider-agnostic object storage. Application code must not import
 * local/S3 modules directly — use resolveObjectStorage().
 */
export type StoredObject = {
  storageKey: string;
  byteSize: number;
};

export type ObjectStorage = {
  readonly name: "local" | "s3" | "vercel_blob";
  put(input: {
    storageKey: string;
    bytes: Buffer;
    contentType: string;
  }): Promise<StoredObject>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
};
