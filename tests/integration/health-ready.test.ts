import { beforeAll, describe, expect, it } from "vitest";
import { GET as readiness } from "@/app/api/health/ready/route";
import { setupTestEnv } from "../helpers/db";

beforeAll(() => {
  setupTestEnv();
});

describe("health readiness", () => {
  it("reports ready when database is reachable", async () => {
    const res = await readiness();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.database).toBe("up");
    expect(JSON.stringify(body)).not.toMatch(/password|DATABASE_URL|postgres:\/\//i);
  });
});
