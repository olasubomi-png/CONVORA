import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError, ConfigurationError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";

const PAYSTACK_BASE = "https://api.paystack.co";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 256_000;

export type PaystackInitializeResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export type PaystackVerifyResult = {
  status: string;
  paid: boolean;
  amountMinor: number;
  currency: string;
  reference: string;
  providerTransactionId: string | null;
  customerEmail: string | null;
  paidAt: string | null;
  channel: string | null;
  rawSafe: Record<string, unknown>;
};

function getSecretKey(): string {
  const env = getServerEnv();
  const key = env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new ConfigurationError(
      "Paystack is not configured (PAYSTACK_SECRET_KEY missing).",
    );
  }
  return key;
}

async function paystackFetch(
  path: string,
  init: RequestInit,
): Promise<unknown> {
  if (!path.startsWith("/")) {
    throw new AppError("VALIDATION_ERROR", "Invalid Paystack path.", 400, true);
  }
  const url = `${PAYSTACK_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${getSecretKey()}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Paystack response too large.",
        502,
        true,
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AppError(
        "INTERNAL_ERROR",
        "Invalid Paystack response.",
        502,
        true,
      );
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function paystackInitializeTransaction(input: {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string | number | boolean>;
}): Promise<PaystackInitializeResult> {
  const json = (await paystackFetch("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: input.amountMinor,
      currency: input.currency,
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
  })) as {
    status?: boolean;
    message?: string;
    data?: {
      authorization_url?: string;
      access_code?: string;
      reference?: string;
    };
  };

  if (!json.status || !json.data?.authorization_url || !json.data.reference) {
    throw new AppError(
      "INTERNAL_ERROR",
      (json.message ?? "Paystack initialize failed").slice(0, 200),
      502,
      true,
    );
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code ?? "",
    reference: json.data.reference,
  };
}

export async function paystackVerifyTransaction(
  reference: string,
): Promise<PaystackVerifyResult> {
  if (!/^[a-zA-Z0-9_-]+$/.test(reference) || reference.length > 100) {
    throw new AppError("VALIDATION_ERROR", "Invalid payment reference.", 400, true);
  }
  const json = (await paystackFetch(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
  )) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      amount?: number;
      currency?: string;
      reference?: string;
      id?: number;
      paid_at?: string | null;
      channel?: string | null;
      customer?: { email?: string };
    };
  };

  if (!json.status || !json.data) {
    throw new AppError(
      "INTERNAL_ERROR",
      (json.message ?? "Paystack verify failed").slice(0, 200),
      502,
      true,
    );
  }

  const data = json.data;
  const paid = data.status === "success";
  return {
    status: data.status ?? "unknown",
    paid,
    amountMinor: Number(data.amount ?? 0),
    currency: (data.currency ?? "NGN").toUpperCase(),
    reference: data.reference ?? reference,
    providerTransactionId: data.id != null ? String(data.id) : null,
    customerEmail: data.customer?.email ?? null,
    paidAt: data.paid_at ?? null,
    channel: data.channel ?? null,
    rawSafe: {
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      reference: data.reference,
      id: data.id,
      channel: data.channel,
      paid_at: data.paid_at,
    },
  };
}

/** Verify x-paystack-signature = HMAC SHA512 of raw body with secret. */
export function verifyPaystackWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  let secret: string;
  try {
    secret = getSecretKey();
  } catch {
    return false;
  }
  const expected = createHmac("sha512", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signatureHeader);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
