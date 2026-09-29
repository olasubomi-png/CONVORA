import { beforeEach, describe, expect, it } from "vitest";
import { authorizeNotificationWorker } from "@/lib/notifications/worker-auth";
import { AuthorizationError, ValidationError } from "@/lib/errors";

describe("authorizeNotificationWorker", () => {
  beforeEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.NOTIFICATION_WORKER_SECRET;
  });

  it("rejects when no secret is configured", () => {
    const req = new Request("http://localhost/api/notifications/worker");
    expect(() => authorizeNotificationWorker(req)).toThrow(ValidationError);
  });

  it("rejects unauthorized request", () => {
    process.env.CRON_SECRET = "correct-secret-value-32chars!!";
    const req = new Request("http://localhost/api/notifications/worker", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(() => authorizeNotificationWorker(req)).toThrow(AuthorizationError);
  });

  it("accepts CRON_SECRET bearer (Vercel Cron)", () => {
    process.env.CRON_SECRET = "vercel-cron-secret-value-ok!!";
    const req = new Request("http://localhost/api/notifications/worker", {
      headers: {
        authorization: "Bearer vercel-cron-secret-value-ok!!",
      },
    });
    expect(() => authorizeNotificationWorker(req)).not.toThrow();
  });

  it("accepts NOTIFICATION_WORKER_SECRET header", () => {
    process.env.NOTIFICATION_WORKER_SECRET = "ops-worker-secret-value-ok!";
    const req = new Request("http://localhost/api/notifications/worker", {
      headers: {
        "x-convora-worker-secret": "ops-worker-secret-value-ok!",
      },
    });
    expect(() => authorizeNotificationWorker(req)).not.toThrow();
  });

  it("rejects mismatched length secrets without throwing timing errors", () => {
    process.env.CRON_SECRET = "abcdefghijklmnop";
    const req = new Request("http://localhost/api/notifications/worker", {
      headers: { authorization: "Bearer short" },
    });
    expect(() => authorizeNotificationWorker(req)).toThrow(AuthorizationError);
  });
});
