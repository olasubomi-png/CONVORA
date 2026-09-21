import { describe, expect, it } from "vitest";
import { GET as liveness } from "@/app/api/health/route";

describe("health liveness", () => {
  it("returns ok without secrets", async () => {
    const res = await liveness();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.check).toBe("liveness");
    expect(JSON.stringify(body)).not.toMatch(/password|secret|postgres:\/\//i);
  });
});
