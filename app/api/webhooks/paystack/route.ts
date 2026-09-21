import { NextResponse } from "next/server";
import { verifyPaystackWebhookSignature } from "@/lib/billing/paystack/client";
import { verifyAndActivatePayment } from "@/lib/billing/activate";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError } from "@/lib/errors";
import { jsonError } from "@/lib/api/response";
import { z } from "zod";

const eventSchema = z.object({
  event: z.string(),
  data: z
    .object({
      reference: z.string().optional(),
      status: z.string().optional(),
    })
    .passthrough(),
});

/**
 * Paystack webhook — signature required. Activation only after verify API.
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
    if (rawBody.length > 512_000) {
      return new NextResponse("Payload too large", { status: 413 });
    }

    const signature = request.headers.get("x-paystack-signature");
    if (!verifyPaystackWebhookSignature(rawBody, signature)) {
      return new NextResponse("Invalid signature", { status: 401 });
    }

    let raw: unknown;
    try {
      raw = JSON.parse(rawBody);
    } catch {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const parsed = eventSchema.safeParse(raw);
    if (!parsed.success) {
      return new NextResponse("Bad Request", { status: 400 });
    }

    const { event, data } = parsed.data;

    if (
      (event === "charge.success" || event === "paymentrequest.success") &&
      data.reference
    ) {
      try {
        await verifyAndActivatePayment(data.reference);
      } catch {
        // Acknowledge receipt; avoid endless retries for business validation errors
        // after signature was valid. Transient errors can still be retried by Paystack.
      }
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
