/**
 * Integer-safe money helpers. All amounts are minor units (kobo for NGN).
 * Never use IEEE floating point for money storage or comparison.
 */

/** Convert whole naira to kobo. */
export function nairaToKobo(naira: number): number {
  if (!Number.isInteger(naira) || naira < 0) {
    throw new Error("naira must be a non-negative integer");
  }
  return naira * 100;
}

/**
 * Yearly amount from monthly minor units and discount basis points.
 * Formula: floor(monthly * 12 * (10000 - bps) / 10000)
 * Ensures whole minor units (no fractional kobo).
 */
export function yearlyAmountFromMonthly(
  monthlyMinor: number,
  yearlyDiscountBps: number,
): number {
  if (!Number.isInteger(monthlyMinor) || monthlyMinor < 0) {
    throw new Error("monthlyMinor must be non-negative integer");
  }
  if (
    !Number.isInteger(yearlyDiscountBps) ||
    yearlyDiscountBps < 0 ||
    yearlyDiscountBps > 10000
  ) {
    throw new Error("yearlyDiscountBps must be integer 0..10000");
  }
  // Compute whole-naira yearly then convert to kobo so payable amount is whole ₦.
  // e.g. 6799 * 12 * 0.8 = 65270.4 → ₦65,270 → 6_527_000 kobo
  const product = monthlyMinor * 12 * (10000 - yearlyDiscountBps);
  const wholeNaira = Math.floor(product / 1_000_000); // /10000/100
  return wholeNaira * 100;
}

/** Format kobo as naira string for display (not for calculation). */
export function formatNairaFromKobo(minor: number): string {
  const whole = Math.floor(minor / 100);
  return `₦${whole.toLocaleString("en-NG")}`;
}
