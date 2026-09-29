import { NextResponse } from "next/server";
import { processNotificationDeliveries } from "@/lib/notifications/delivery";
import { authorizeNotificationWorker } from "@/lib/notifications/worker-auth";
import { jsonError } from "@/lib/api/response";

/**
 * Legacy alias for /api/notifications/worker.
 * Prefer the canonical cron path going forward.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function run() {
  const result = await processNotificationDeliveries({ limit: 40 });
  return NextResponse.json({
    ok: true,
    claimed: result.claimed,
    processed: result.processed,
  });
}

export async function GET(request: Request) {
  try {
    authorizeNotificationWorker(request);
    return await run();
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    authorizeNotificationWorker(request);
    return await run();
  } catch (error) {
    return jsonError(error);
  }
}
