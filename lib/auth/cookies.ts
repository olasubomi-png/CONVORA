import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env";

export const SESSION_COOKIE_NAME = "convora_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 14;

export function getSessionDurationMs(): number {
  return SESSION_DURATION_MS;
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const env = getServerEnv();
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE_NAME)?.value;
}
