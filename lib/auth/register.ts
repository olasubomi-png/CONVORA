import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSessionRecord } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { recordAuditEvent } from "@/lib/audit";
import { AppError, ConflictError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";
import { normalizeEmail, type RegisterInput } from "@/lib/validation/auth";
import { logger } from "@/lib/observability/logger";
import { classifyError } from "@/lib/observability/classify-error";
import { getServerEnv } from "@/lib/env";

export async function registerUser(
  input: RegisterInput,
  options?: { setCookie?: boolean },
) {
  let step = "init";
  try {
    step = "database";
    const db = getDatabase();
    const email = normalizeEmail(input.email);

    step = "lookup";
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing[0]) {
      throw new ConflictError("An account with this email already exists.");
    }

    step = "password_hash";
    const passwordHash = await hashPassword(input.password);

    step = "user_insert";
    let user: { id: string };
    try {
      const [inserted] = await db
        .insert(users)
        .values({
          email,
          passwordHash,
          fullName: input.fullName,
          status: "ACTIVE",
        })
        .returning({ id: users.id });
      if (!inserted) {
        throw new Error("Failed to create user");
      }
      user = inserted;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("An account with this email already exists.");
      }
      throw error;
    }

    step = "session_insert";
    const session = await createSessionRecord(user.id);

    if (options?.setCookie !== false) {
      step = "session_cookie";
      try {
        await setSessionCookie(session.token, session.expiresAt);
      } catch (cookieError) {
        // Tests run outside a request context; production must surface cookie failures.
        if (getServerEnv().NODE_ENV === "test") {
          /* intentional */
        } else {
          throw cookieError;
        }
      }
    }

    step = "audit";
    await recordAuditEvent({
      eventType: "USER_REGISTERED",
      actorUserId: user.id,
      payload: {},
    });

    return {
      userId: user.id,
      sessionId: session.sessionId,
      token: session.token,
      expiresAt: session.expiresAt,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const d = classifyError(error);
    logger.error("register_failed", {
      operation: "registerUser",
      step,
      name: d.name,
      code: d.code ?? null,
      subsystem: d.subsystem ?? null,
      messageSnippet: d.messageSnippet ?? null,
    });
    throw error;
  }
}
