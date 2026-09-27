import { ValidationError } from "@/lib/errors";

/** Allowed image MIME types for uploads */
export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MiB
export const MAX_POST_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MiB

/**
 * Detect image MIME from magic bytes. Do not trust client Content-Type alone.
 */
export function detectImageMime(bytes: Buffer): AllowedImageMime | null {
  if (bytes.length < 12) return null;
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  // GIF
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function assertValidImageUpload(input: {
  bytes: Buffer;
  maxBytes: number;
  claimedMime?: string | null;
}): AllowedImageMime {
  if (input.bytes.length === 0) {
    throw new ValidationError("Empty file.");
  }
  if (input.bytes.length > input.maxBytes) {
    throw new ValidationError(
      `Image exceeds maximum size of ${Math.floor(input.maxBytes / (1024 * 1024))}MB.`,
    );
  }
  const detected = detectImageMime(input.bytes);
  if (!detected) {
    throw new ValidationError("Unsupported or invalid image format.");
  }
  if (
    input.claimedMime &&
    input.claimedMime !== detected &&
    // allow image/jpg alias
    !(input.claimedMime === "image/jpg" && detected === "image/jpeg")
  ) {
    // Prefer detected; soft mismatch is OK if magic matches allowed set
  }
  return detected;
}

export function extensionForMime(mime: AllowedImageMime): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
  }
}
