import { NextResponse } from "next/server";
import { processNotificationDeliveries } from "@/lib/notifications/delivery";
import { authorizeNotificationWorker } from "@/lib/notifications/worker-auth";
import { jsonError } from "@/lib/api/response";

export const runtime = "nodejs";
/** Avoid static optimization; always run on demand. */
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 40;

/**
 * Durable notification delivery worker (PUSH / EMAIL / WHATSAPP).
 *
 * Scheduled by Vercel Cron (see vercel.json):
 *   path: /api/notifications/worker
 *   schedule: every minute
 *
 * Authentication:
 * - Vercel Cron: Authorization: Bearer <CRON_SECRET>
 * - External: Bearer or x-convora-worker-secret = NOTIFICATION_WORKER_SECRET
 *
 * Processes all due jobs globally. Does not accept organizationId from the
 * caller (avoids unauthenticated tenant scoping abuse). Tenant isolation is
 * enforced by row data + provider credentials, not request parameters.
 */
async function handleWorker(): Promise<Response> {
  try {
    const result = await processNotificationDeliveries({
      limit: DEFAULT_LIMIT,
    });
    return NextResponse.json({
      ok: true,
      claimed: result.claimed,
      processed: result.processed,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  try {
    authorizeNotificationWorker(request);
  } catch (error) {
    return jsonError(error);
  }
  return handleWorker();
}

export async function POST(request: Request) {
  try {
    authorizeNotificationWorker(request);
  } catch (error) {
    return jsonError(error);
  }
  // Intentionally ignore body organizationId — global due-job processing only.
  void request;
  return handleWorker();
}
