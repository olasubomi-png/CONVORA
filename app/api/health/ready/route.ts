import { NextResponse } from "next/server";
import { probeDatabaseConnectivity } from "@/db";

/**
 * Readiness: critical dependencies required to serve traffic.
 * Currently verifies PostgreSQL connectivity with the same connection
 * options used by the application database client.
 * Does not call Paystack, Meta, or OpenAI.
 * Never returns connection strings or secrets.
 */
export async function GET() {
  const result = await probeDatabaseConnectivity();

  if (result.ok) {
    return NextResponse.json(
      {
        status: "ready",
        check: "readiness",
        database: "up",
        latencyMs: result.latencyMs,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return NextResponse.json(
    {
      status: "not_ready",
      check: "readiness",
      database: "down",
      timestamp: new Date().toISOString(),
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
