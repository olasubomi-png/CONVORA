import { NextResponse } from "next/server";
import { processPaystackWebhook } from "@/lib/billing/paystack/webhook";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";

/**
 * Paystack webhook.
 * - 401 invalid signature
 * - 400 malformed payload
 * - 200 success / permanent business outcomes / unknown events
 * - 5xx transient failures (Paystack will retry)
 *
 * Never activates from webhook payload alone — always verifies via Paystack API.
 */
export async function POST(request: Request) {
  try {
    const rl = checkRateLimit({
      key: "paystack:webhook",
      limit: 300,
      windowMs: 60_000,
    });
    if (!rl.allowed) throw new RateLimitError();

    const rawBody = await request.text();
    const signature = request.headers.get("x-paystack-signature");
    const result = await processPaystackWebhook({
      rawBody,
      signatureHeader: signature,
    });

    return new NextResponse(result.body, { status: result.status });
  } catch (error) {
    return jsonError(error);
  }
}
