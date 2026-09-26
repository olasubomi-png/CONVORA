import { NextResponse } from "next/server";
import { completeMetaOAuth } from "@/lib/channels/meta/oauth";
import {
  META_OAUTH_COOKIE,
  metaOAuthCookieOptions,
} from "@/lib/channels/meta/oauth-state";
import { getServerEnv } from "@/lib/env";
import { toPublicError } from "@/lib/errors";

/**
 * Meta OAuth redirect URI (Facebook Login for Business).
 * Validates signed state + cookie binding, exchanges code, stores encrypted credentials.
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

  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieState = parseCookie(cookieHeader, META_OAUTH_COOKIE);

  const clearCookie = (res: NextResponse) => {
    res.cookies.set(META_OAUTH_COOKIE, "", {
      ...metaOAuthCookieOptions(0),
      maxAge: 0,
    });
    return res;
  };

  try {
    const result = await completeMetaOAuth({
      code,
      state,
      cookieState,
      error,
      errorDescription,
    });

    const settingsPath =
      result.provider === "meta_instagram"
        ? "/app/settings/instagram"
        : result.provider === "whatsapp_cloud"
          ? "/app/settings/whatsapp"
          : "/app/settings/facebook";

    const dest = new URL(settingsPath, appUrl);
    if (result.status === "CONNECTED") {
      dest.searchParams.set("meta", "connected");
    } else {
      dest.searchParams.set("meta", "needs_action");
      dest.searchParams.set("message", result.message.slice(0, 200));
    }
    return clearCookie(NextResponse.redirect(dest.toString(), 302));
  } catch (err) {
    const publicError = toPublicError(err);
    const dest = new URL("/app/channels", appUrl);
    dest.searchParams.set("oauth", "error");
    dest.searchParams.set(
      "message",
      publicError.payload.error.message.slice(0, 200),
    );
    return clearCookie(NextResponse.redirect(dest.toString(), 302));
  }
}

function parseCookie(header: string, name: string): string | null {
  const parts = header.split(";");
  for (const part of parts) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return null;
}
