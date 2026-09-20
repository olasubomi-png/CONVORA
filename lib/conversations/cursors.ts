import { ValidationError } from "@/lib/errors";

/**
 * Opaque cursor: base64url(JSON { t: ISO timestamp, i: uuid })
 */
export type TimeIdCursor = { t: string; i: string };

export function encodeTimeIdCursor(createdAt: Date, id: string): string {
  const payload: TimeIdCursor = {
    t: createdAt.toISOString(),
    i: id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeTimeIdCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as TimeIdCursor;
    if (
      typeof parsed?.t !== "string" ||
      typeof parsed?.i !== "string" ||
      !parsed.i.match(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
    ) {
      throw new Error("invalid");
    }
    const createdAt = new Date(parsed.t);
    if (Number.isNaN(createdAt.getTime())) {
      throw new Error("invalid date");
    }
    return { createdAt, id: parsed.i };
  } catch {
    throw new ValidationError("Invalid pagination cursor.");
  }
}
