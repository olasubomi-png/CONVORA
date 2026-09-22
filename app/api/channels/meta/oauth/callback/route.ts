import { NextResponse } from "next/server";
import { completeMetaOAuth } from "@/lib/channels/meta/oauth";
import { getServerEnv } from "@/lib/env";
import { toPublicError } from "@/lib/errors";

/**
 * Meta OAuth redirect URI.
 * Validates one-time state, exchanges code, stores encrypted credentials.
 * Never echoes tokens to the browser.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  let appUrl = process.env.APP_URL ?? "http://localhost:3000";
  try {
    appUrl = getServerEnv().APP_URL;
  } catch {
    // keep process.env fallback
  }

  try {
    const result = await completeMetaOAuth({
      code,
      state,
      error,
      errorDescription,
    });

    const dest = new URL("/app/channels", appUrl);
    dest.searchParams.set("oauth", result.status === "CONNECTED" ? "success" : "needs_action");
    dest.searchParams.set("provider", result.provider);
    dest.searchParams.set("count", String(result.connectedCount));
    return NextResponse.redirect(dest.toString(), 302);
  } catch (err) {
    const publicError = toPublicError(err);
    const dest = new URL("/app/channels", appUrl);
    dest.searchParams.set("oauth", "error");
    dest.searchParams.set(
      "message",
      publicError.payload.error.message.slice(0, 200),
    );
    return NextResponse.redirect(dest.toString(), 302);
  }
}
