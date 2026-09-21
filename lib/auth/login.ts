import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionRecord, revokeOtherSessions } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { recordAuditEvent } from "@/lib/audit";
import { AppError, AuthenticationError } from "@/lib/errors";
import { normalizeEmail, type LoginInput } from "@/lib/validation/auth";
import { logger } from "@/lib/observability/logger";
import { classifyError } from "@/lib/observability/classify-error";
import { getServerEnv } from "@/lib/env";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export async function loginUser(
  input: LoginInput,
  options?: { setCookie?: boolean },
) {
  let step = "init";
  try {
    step = "database";
    const db = getDatabase();
    const email = normalizeEmail(input.email);

    step = "lookup";
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const user = rows[0];

    step = "password_verify";
    const passwordHash = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
    const valid = await verifyPassword(passwordHash, input.password);
    if (!user || !valid || user.status !== "ACTIVE") {
      throw new AuthenticationError("Invalid email or password.");
    }

    step = "last_login_update";
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    step = "session_insert";
    const session = await createSessionRecord(user.id);

    step = "session_revoke_others";
    await revokeOtherSessions(user.id, session.sessionId);

    if (options?.setCookie !== false) {
      step = "session_cookie";
      try {
        await setSessionCookie(session.token, session.expiresAt);
      } catch (cookieError) {
        if (getServerEnv().NODE_ENV === "test") {
          /* intentional */
        } else {
          throw cookieError;
        }
      }
    }

    step = "audit";
    await recordAuditEvent({
      eventType: "USER_LOGIN",
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
    logger.error("login_failed", {
      operation: "loginUser",
      step,
      name: d.name,
      code: d.code ?? null,
      subsystem: d.subsystem ?? null,
      messageSnippet: d.messageSnippet ?? null,
    });
    throw error;
  }
}
