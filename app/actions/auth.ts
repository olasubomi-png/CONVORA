"use server";

import { redirect } from "next/navigation";
import { registerUser } from "@/lib/auth/register";
import { loginUser } from "@/lib/auth/login";
import { revokeCurrentSession, getSession } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError, toPublicError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { loginSchema, registerSchema } from "@/lib/validation/auth";

export type ActionResult = { ok: true } | { ok: false; error: string; code?: string };

function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

function isRedirectError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT");
}

export async function registerAction(formData: FormData): Promise<ActionResult> {
  try {
    const input = parseInput(registerSchema, formDataToObject(formData));
    const rate = checkRateLimit({ key: `register:email:${input.email}`, limit: 5, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) throw new RateLimitError("Too many registration attempts. Try again later.");
    await registerUser(input);
    redirect("/app");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const publicError = toPublicError(error);
    return { ok: false, error: publicError.payload.error.message, code: publicError.payload.error.code };
  }
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  try {
    const input = parseInput(loginSchema, formDataToObject(formData));
    const rate = checkRateLimit({ key: `login:email:${input.email}`, limit: 10, windowMs: 15 * 60 * 1000 });
    if (!rate.allowed) throw new RateLimitError("Too many login attempts. Try again later.");
    await loginUser(input);
    redirect("/app");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const publicError = toPublicError(error);
    return { ok: false, error: publicError.payload.error.message, code: publicError.payload.error.code };
  }
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) await recordAuditEvent({ eventType: "USER_LOGOUT", actorUserId: session.user.id, payload: {} });
  await revokeCurrentSession();
  redirect("/login");
}
