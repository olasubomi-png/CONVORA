import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDatabase } from "@/db";

/**
 * Readiness: critical dependencies required to serve traffic.
 * Currently verifies PostgreSQL connectivity.
 * Does not call Paystack, Meta, or OpenAI.
 * Never returns connection strings or secrets.
 */
export async function GET() {
  const started = Date.now();
  try {
    const db = getDatabase();
    await db.execute(sql`SELECT 1`);
    return NextResponse.json(
      {
        status: "ready",
        check: "readiness",
        database: "up",
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
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
}
