import { describe, expect, it } from "vitest";
import { GET as liveness } from "@/app/api/health/route";
import { GET as readiness } from "@/app/api/health/ready/route";
import { probeDatabaseConnectivity } from "@/db";

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

describe("health readiness", () => {
  it("reports database down when DATABASE_URL is missing", async () => {
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const probe = await probeDatabaseConnectivity();
      expect(probe.ok).toBe(false);
      if (!probe.ok) {
        expect(probe.reason).toBe("missing_url");
      }

      const res = await readiness();
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.status).toBe("not_ready");
      expect(body.check).toBe("readiness");
      expect(body.database).toBe("down");
      expect(JSON.stringify(body)).not.toMatch(/password|secret|postgres:\/\//i);
    } finally {
      if (previous !== undefined) {
        process.env.DATABASE_URL = previous;
      }
    }
  });

  it("reports database up when DATABASE_URL points at a reachable database", async () => {
    const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) {
      return;
    }
    process.env.DATABASE_URL = url;
    const probe = await probeDatabaseConnectivity();
    expect(probe.ok).toBe(true);
    if (probe.ok) {
      expect(probe.latencyMs).toBeGreaterThanOrEqual(0);
    }

    const res = await readiness();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.check).toBe("readiness");
    expect(body.database).toBe("up");
    expect(JSON.stringify(body)).not.toMatch(/password|secret|postgres:\/\//i);
  });

  it("does not require CHANNEL_SECRETS_KEY for the database probe", async () => {
    const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url) {
      return;
    }
    const previousKey = process.env.CHANNEL_SECRETS_KEY;
    process.env.DATABASE_URL = url;
    delete process.env.CHANNEL_SECRETS_KEY;
    try {
      // Probe must not go through getServerEnv() production validation.
      const probe = await probeDatabaseConnectivity();
      expect(probe.ok).toBe(true);
    } finally {
      if (previousKey !== undefined) {
        process.env.CHANNEL_SECRETS_KEY = previousKey;
      } else {
        delete process.env.CHANNEL_SECRETS_KEY;
      }
    }
  });
});
