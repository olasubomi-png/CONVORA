"use server";

import { redirect } from "next/navigation";
import { registerUser } from "@/lib/auth/register";
import { loginUser } from "@/lib/auth/login";
import { revokeCurrentSession, getSession } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { RateLimitError, toPublicError, isAppError } from "@/lib/errors";
import { parseInput } from "@/lib/validation";
import { loginSchema, registerSchema } from "@/lib/validation/auth";
import { isNextRedirectError } from "@/lib/auth/redirect";
import { logger } from "@/lib/observability/logger";
import { classifyError } from "@/lib/observability/classify-error";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

function publicActionError(error: unknown): ActionResult {
  if (!isAppError(error)) {
    const d = classifyError(error);
    logger.error("auth_action_unexpected", {
      name: d.name,
      code: d.code ?? null,
      subsystem: d.subsystem ?? null,
      messageSnippet: d.messageSnippet ?? null,
    });
  }
  const publicError = toPublicError(error);
  return {
    ok: false,
    error: publicError.payload.error.message,
    code: publicError.payload.error.code,
  };
}

export async function registerAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const input = parseInput(registerSchema, formDataToObject(formData));
    const rate = checkRateLimit({
      key: `register:email:${input.email}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    if (!rate.allowed) {
      throw new RateLimitError(
        "Too many registration attempts. Try again later.",
      );
    }
    await registerUser(input);
    redirect("/app");
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    return publicActionError(error);
  }
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  try {
    const input = parseInput(loginSchema, formDataToObject(formData));
    const rate = checkRateLimit({
      key: `login:email:${input.email}`,
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (!rate.allowed) {
      throw new RateLimitError("Too many login attempts. Try again later.");
    }
    await loginUser(input);
    redirect("/app");
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    return publicActionError(error);
  }
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await recordAuditEvent({
      eventType: "USER_LOGOUT",
      actorUserId: session.user.id,
      payload: {},
    });
  }
  await revokeCurrentSession();
  redirect("/login");
}
