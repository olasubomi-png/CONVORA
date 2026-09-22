import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Next.js forbids sibling dynamic segments with different names at the same path level
 * (e.g. [id] and [conversationId] under app/api/conversations).
 */
describe("conversation API dynamic route param", () => {
  it("uses a single canonical dynamic segment under app/api/conversations", () => {
    const root = join(process.cwd(), "app/api/conversations");
    const entries = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => n.startsWith("[") && n.endsWith("]"));

    expect(entries).toEqual(["[id]"]);
    expect(existsSync(join(root, "[conversationId]"))).toBe(false);
    expect(existsSync(join(root, "[id]", "watchers", "route.ts"))).toBe(true);
  });
});
