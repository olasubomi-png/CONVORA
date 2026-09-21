import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db";
import { usageMeters } from "@/db/schema";
import { getEntitlementLimit } from "@/lib/billing/entitlements";
import type { EntitlementKey } from "@/lib/billing/entitlement-keys";
import { AuthorizationError } from "@/lib/errors";

function monthBounds(now = new Date()): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { start, end };
}

export async function getUsageQuantity(
  organizationId: string,
  meterKey: string,
): Promise<number> {
  const { start } = monthBounds();
  const db = getDatabase();
  const [row] = await db
    .select()
    .from(usageMeters)
    .where(
      and(
        eq(usageMeters.organizationId, organizationId),
        eq(usageMeters.meterKey, meterKey),
        eq(usageMeters.periodStart, start),
      ),
    )
    .limit(1);
  return row?.quantity ?? 0;
}

/**
 * Atomically increment usage if under limit.
 * Uses INSERT … ON CONFLICT DO NOTHING + conditional UPDATE.
 */
export async function consumeUsage(input: {
  organizationId: string;
  meterKey: string;
  limitKey: EntitlementKey;
  delta?: number;
}): Promise<{ allowed: boolean; quantity: number; limit: number | null }> {
  const delta = input.delta ?? 1;
  const limit = await getEntitlementLimit(
    input.organizationId,
    input.limitKey,
  );
  if (limit === null) {
    throw new AuthorizationError("Usage is not available on the current plan.");
  }

  const { start, end } = monthBounds();
  const db = getDatabase();

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  await db.execute(sql`
    INSERT INTO usage_meters (
      organization_id, meter_key, period_start, period_end, quantity
    ) VALUES (
      ${input.organizationId}::uuid,
      ${input.meterKey},
      ${startIso}::timestamptz,
      ${endIso}::timestamptz,
      0
    )
    ON CONFLICT (organization_id, meter_key, period_start) DO NOTHING
  `);

  const result = await db.execute(sql`
    UPDATE usage_meters
    SET quantity = quantity + ${delta},
        updated_at = now()
    WHERE organization_id = ${input.organizationId}::uuid
      AND meter_key = ${input.meterKey}
      AND period_start = ${startIso}::timestamptz
      AND quantity + ${delta} <= ${limit}
    RETURNING quantity
  `);

  const rows: Array<{ quantity?: unknown }> = Array.isArray(result)
    ? (result as unknown as Array<{ quantity?: unknown }>)
    : [];

  const first = rows[0];
  if (first && first.quantity !== undefined && first.quantity !== null) {
    return { allowed: true, quantity: Number(first.quantity), limit };
  }

  const current = await getUsageQuantity(
    input.organizationId,
    input.meterKey,
  );
  return { allowed: false, quantity: current, limit };
}

export async function requireUsageAllowance(input: {
  organizationId: string;
  meterKey: string;
  limitKey: EntitlementKey;
  delta?: number;
}): Promise<void> {
  const result = await consumeUsage(input);
  if (!result.allowed) {
    throw new AuthorizationError(
      "Monthly usage limit reached for this plan. Upgrade or wait for the next period.",
    );
  }
}
