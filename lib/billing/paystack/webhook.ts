import { AppError } from "@/lib/errors";
import { verifyAndActivatePayment } from "@/lib/billing/activate";
import { verifyPaystackWebhookSignature } from "@/lib/billing/paystack/client";
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

const SUCCESS_EVENTS = new Set([
  "charge.success",
  "paymentrequest.success",
]);

/**
 * Permanent failures must not be retried by Paystack (return 200 after handling).
 * Transient failures should return 5xx so Paystack retries.
 */
export function isPermanentPaymentWebhookError(error: unknown): boolean {
  if (error instanceof AppError) {
    switch (error.code) {
      case "VALIDATION_ERROR":
      case "NOT_FOUND":
      case "CONFLICT":
      case "AUTHORIZATION_ERROR":
      case "AUTHENTICATION_ERROR":
        return true;
      case "RATE_LIMIT":
      case "CONFIGURATION_ERROR":
      case "INTERNAL_ERROR":
        return false;
      default:
        return false;
    }
  }
  // Unknown errors are treated as transient (DB down, network, etc.)
  return false;
}

export type WebhookProcessResult =
  | { status: 401; body: string }
  | { status: 400; body: string }
  | { status: 413; body: string }
  | { status: 200; body: string }
  | { status: 500; body: string };

/**
 * Process a raw Paystack webhook body after rate limiting.
 * Activation always goes through verifyAndActivatePayment (server-side Paystack verify).
 */
export async function processPaystackWebhook(input: {
  rawBody: string;
  signatureHeader: string | null;
}): Promise<WebhookProcessResult> {
  if (input.rawBody.length > 512_000) {
    return { status: 413, body: "Payload too large" };
  }

  if (!verifyPaystackWebhookSignature(input.rawBody, input.signatureHeader)) {
    return { status: 401, body: "Invalid signature" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: "Bad Request" };
  }

  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: "Bad Request" };
  }

  const { event, data } = parsed.data;

  if (!SUCCESS_EVENTS.has(event)) {
    // Unknown / non-payment events — acknowledge without mutation
    return { status: 200, body: "OK" };
  }

  if (!data.reference || typeof data.reference !== "string") {
    // Success event without reference — permanent client/provider shape issue
    return { status: 200, body: "OK" };
  }

  try {
    await verifyAndActivatePayment(data.reference);
    return { status: 200, body: "OK" };
  } catch (error) {
    if (isPermanentPaymentWebhookError(error)) {
      // Signature valid; business rule failed or unknown reference.
      // Do not retry activation loops.
      return { status: 200, body: "OK" };
    }
    // Transient — ask Paystack to retry
    return { status: 500, body: "Internal Error" };
  }
}
