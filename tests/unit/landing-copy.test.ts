import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("public landing copy", () => {
  it("does not claim Phase 0 or unfinished product", () => {
    const src = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
    expect(src).not.toMatch(/Phase 0/i);
    expect(src).not.toMatch(/not available yet/i);
    expect(src).not.toMatch(/Engineering foundation only/i);
    expect(src).toMatch(/One inbox for every customer conversation/i);
    expect(src).toMatch(/WhatsApp/);
    expect(src).toMatch(/Start free trial/);
  });
});
