import { timingSafeEqual } from "node:crypto";
import { AuthorizationError, ValidationError } from "@/lib/errors";

function secretsEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Authorize notification delivery worker invocations.
 *
 * Accepted credentials (first match wins configuration-wise; either may authenticate):
 * - CRON_SECRET — Vercel Cron sends Authorization: Bearer <CRON_SECRET>
 * - NOTIFICATION_WORKER_SECRET — external cron / ops tooling
 *
 * Prefer CRON_SECRET on Vercel. Secrets are never returned in responses.
 */
export function authorizeNotificationWorker(request: Request): void {
  const cronSecret = process.env.CRON_SECRET?.trim() || "";
  const workerSecret = process.env.NOTIFICATION_WORKER_SECRET?.trim() || "";

  if (!cronSecret && !workerSecret) {
    throw new ValidationError(
      "Notification worker is not configured. Set CRON_SECRET or NOTIFICATION_WORKER_SECRET.",
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerSecret = request.headers.get("x-convora-worker-secret") ?? "";

  const ok =
    (cronSecret &&
      (secretsEqual(bearer, cronSecret) ||
        secretsEqual(headerSecret, cronSecret))) ||
    (workerSecret &&
      (secretsEqual(bearer, workerSecret) ||
        secretsEqual(headerSecret, workerSecret)));

  if (!ok) {
    throw new AuthorizationError("Invalid worker credentials.");
  }
}
