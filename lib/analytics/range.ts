import { ValidationError } from "@/lib/errors";

export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7_days"
  | "last_30_days"
  | "last_90_days"
  | "custom";

export type AnalyticsRange = {
  /** Inclusive start (UTC). */
  from: Date;
  /** Exclusive end (UTC). */
  to: Date;
  preset: DatePreset;
};

const MAX_RANGE_DAYS = 366;

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function addUtcDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

/**
 * Parse YYYY-MM-DD or ISO string as UTC day start (inclusive) or end (exclusive next day).
 */
function parseUtcBoundary(value: string, kind: "start" | "end"): Date {
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (dayOnly) {
    const [y, m, d] = value.split("-").map(Number);
    const start = new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0));
    return kind === "start" ? start : addUtcDays(start, 1);
  }
  return new Date(value);
}

/**
 * Resolve analytics window in UTC. All timestamps in CONVORA are timestamptz.
 */
export function resolveAnalyticsRange(input: {
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): AnalyticsRange {
  const now = input.now ?? new Date();
  const today = startOfUtcDay(now);
  const preset = (input.preset ?? "last_30_days") as DatePreset;

  if (preset === "custom") {
    if (!input.from || !input.to) {
      throw new ValidationError("Custom range requires from and to (ISO dates).");
    }
    const from = parseUtcBoundary(input.from, "start");
    const to = parseUtcBoundary(input.to, "end");
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new ValidationError("Invalid custom date range.");
    }
    if (from >= to) {
      throw new ValidationError("from must be before to.");
    }
    const days =
      (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (days > MAX_RANGE_DAYS) {
      throw new ValidationError(
        `Date range cannot exceed ${MAX_RANGE_DAYS} days.`,
      );
    }
    return { from, to, preset: "custom" };
  }

  switch (preset) {
    case "today":
      return { from: today, to: addUtcDays(today, 1), preset };
    case "yesterday": {
      const y = addUtcDays(today, -1);
      return { from: y, to: today, preset };
    }
    case "last_7_days":
      return { from: addUtcDays(today, -6), to: addUtcDays(today, 1), preset };
    case "last_30_days":
      return { from: addUtcDays(today, -29), to: addUtcDays(today, 1), preset };
    case "last_90_days":
      return { from: addUtcDays(today, -89), to: addUtcDays(today, 1), preset };
    default:
      throw new ValidationError("Invalid date preset.");
  }
}

export function bucketKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function enumerateUtcDays(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cur = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  while (cur < end) {
    keys.push(bucketKeyUtc(cur));
    cur = addUtcDays(cur, 1);
  }
  return keys;
}
