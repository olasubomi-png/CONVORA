import { describe, expect, it } from "vitest";
import {
  assertValidImageUpload,
  detectImageMime,
  MAX_AVATAR_BYTES,
} from "@/lib/storage/image";
import { ValidationError } from "@/lib/errors";

function png1x1(): Buffer {
  // minimal 1x1 PNG
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
}

describe("image upload validation", () => {
  it("detects PNG magic bytes", () => {
    expect(detectImageMime(png1x1())).toBe("image/png");
  });

  it("rejects empty buffers", () => {
    expect(() =>
      assertValidImageUpload({ bytes: Buffer.alloc(0), maxBytes: MAX_AVATAR_BYTES }),
    ).toThrow(ValidationError);
  });

  it("rejects oversized files", () => {
    const big = Buffer.concat([png1x1(), Buffer.alloc(MAX_AVATAR_BYTES)]);
    expect(() =>
      assertValidImageUpload({ bytes: big, maxBytes: MAX_AVATAR_BYTES }),
    ).toThrow(ValidationError);
  });

  it("rejects non-image payloads", () => {
    expect(() =>
      assertValidImageUpload({
        bytes: Buffer.from("%PDF-1.4 fake"),
        maxBytes: MAX_AVATAR_BYTES,
      }),
    ).toThrow(ValidationError);
  });
});
