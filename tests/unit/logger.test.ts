import { describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/observability/logger";

describe("logger", () => {
  it("redacts secret-like field names", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("test", {
      organizationId: "org_1",
      accessToken: "super-secret",
      api_key: "k",
    });
    const line = spy.mock.calls[0]?.[0] as string;
    expect(line).toContain("[redacted]");
    expect(line).not.toContain("super-secret");
    expect(line).toContain("org_1");
    spy.mockRestore();
  });
});
