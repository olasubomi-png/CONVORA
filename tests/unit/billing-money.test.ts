import { describe, expect, it } from "vitest";
import {
  nairaToKobo,
  yearlyAmountFromMonthly,
} from "@/lib/billing/money";

describe("billing money", () => {
  it("converts naira to kobo as integers", () => {
    expect(nairaToKobo(6799)).toBe(679_900);
    expect(nairaToKobo(15999)).toBe(1_599_900);
  });

  it("applies exactly 20% yearly discount with integer math", () => {
    const starter = yearlyAmountFromMonthly(679_900, 2000);
    const premium = yearlyAmountFromMonthly(1_599_900, 2000);
    // 6799*12*0.8 = 65270.4 → floor kobo = 6_527_000 → ₦65,270
    expect(starter).toBe(6_527_000);
    // 15999*12*0.8 = 153590.4 → 15_359_000 kobo → ₦153,590
    expect(premium).toBe(15_359_000);
  });
});
