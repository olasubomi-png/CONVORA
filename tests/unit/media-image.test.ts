import { describe, expect, it, afterEach } from "vitest";
import {
  assertValidImageUpload,
  detectImageMime,
  MAX_AVATAR_BYTES,
} from "@/lib/storage/image";
import { ValidationError } from "@/lib/errors";
import {
  resolveStorageBackendName,
  resetObjectStorageCache,
} from "@/lib/storage";

function png1x1(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

function jpegMinimal(): Buffer {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0xff, 0xd9,
  ]);
}

function gifHeader(): Buffer {
  return Buffer.from("GIF89a........", "ascii");
}

afterEach(() => {
  resetObjectStorageCache();
  delete process.env.MEDIA_STORAGE_BACKEND;
});

describe("image upload validation", () => {
  it("detects PNG magic bytes", () => {
    expect(detectImageMime(png1x1())).toBe("image/png");
  });

  it("detects JPEG magic bytes", () => {
    expect(detectImageMime(jpegMinimal())).toBe("image/jpeg");
  });

  it("detects GIF magic bytes", () => {
    expect(detectImageMime(gifHeader())).toBe("image/gif");
  });

  it("rejects empty buffers", () => {
    expect(() =>
      assertValidImageUpload({
        bytes: Buffer.alloc(0),
        maxBytes: MAX_AVATAR_BYTES,
      }),
    ).toThrow(ValidationError);
  });

  it("rejects oversized files", () => {
    const big = Buffer.concat([png1x1(), Buffer.alloc(MAX_AVATAR_BYTES)]);
    expect(() =>
      assertValidImageUpload({ bytes: big, maxBytes: MAX_AVATAR_BYTES }),
    ).toThrow(ValidationError);
  });

  it("rejects non-image payloads even with image extension claim", () => {
    expect(() =>
      assertValidImageUpload({
        bytes: Buffer.from("%PDF-1.4 fake"),
        maxBytes: MAX_AVATAR_BYTES,
        claimedMime: "image/png",
      }),
    ).toThrow(ValidationError);
  });
});

describe("storage backend selection", () => {
  it("respects explicit local backend", () => {
    process.env.MEDIA_STORAGE_BACKEND = "local";
    expect(resolveStorageBackendName()).toBe("local");
  });

  it("respects explicit s3 backend", () => {
    process.env.MEDIA_STORAGE_BACKEND = "s3";
    expect(resolveStorageBackendName()).toBe("s3");
  });
});
