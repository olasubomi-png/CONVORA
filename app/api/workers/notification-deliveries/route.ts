import { NextResponse } from "next/server";
import { processNotificationDeliveries } from "@/lib/notifications/delivery";
import { jsonError } from "@/lib/api/response";
import { AuthorizationError, ValidationError } from "@/lib/errors";

/**
 * Background worker endpoint for durable notification delivery (PUSH / EMAIL / WHATSAPP).
 *
 * Authorization: Authorization: Bearer <NOTIFICATION_WORKER_SECRET>
 * or x-convora-worker-secret header matching NOTIFICATION_WORKER_SECRET.
 *
 * Schedule via Vercel Cron / external cron; do not invoke from customer message path.
 */
export async function POST(request: Request) {
  try {
    const expected = process.env.NOTIFICATION_WORKER_SECRET?.trim();
    if (!expected) {
      throw new ValidationError(
        "NOTIFICATION_WORKER_SECRET is not configured.",
      );
    }
    const auth = request.headers.get("authorization") ?? "";
    const headerSecret = request.headers.get("x-convora-worker-secret") ?? "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (bearer !== expected && headerSecret !== expected) {
      throw new AuthorizationError("Invalid worker credentials.");
    }

    const body = await request.json().catch(() => ({}));
    const organizationId =
      typeof body === "object" &&
      body &&
      "organizationId" in body &&
      typeof (body as { organizationId?: unknown }).organizationId === "string"
        ? (body as { organizationId: string }).organizationId
        : undefined;
    const limit =
      typeof body === "object" &&
      body &&
      "limit" in body &&
      typeof (body as { limit?: unknown }).limit === "number"
        ? Math.min(100, Math.max(1, (body as { limit: number }).limit))
        : 40;

    const result = await processNotificationDeliveries({
      organizationId,
      limit,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return jsonError(error);
  }
}

/** Vercel Cron can use GET with the same secret. */
export async function GET(request: Request) {
  return POST(request);
}
