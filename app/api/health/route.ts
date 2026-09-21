import { NextResponse } from "next/server";

/**
 * Liveness: process is up. Does not check database or external services.
 * Safe for load-balancer probes.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      check: "liveness",
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
