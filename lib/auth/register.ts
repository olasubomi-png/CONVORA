import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createSessionRecord } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { recordAuditEvent } from "@/lib/audit";
import { ConflictError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";
import { normalizeEmail, type RegisterInput } from "@/lib/validation/auth";

export async function registerUser(
  input: RegisterInput,
  options?: { setCookie?: boolean },
) {
  const db = getDatabase();
  const email = normalizeEmail(input.email);

  // Fast-path check reduces noise; unique index remains authoritative.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) {
    throw new ConflictError("An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);

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

  const session = await createSessionRecord(user.id);
  if (options?.setCookie !== false) {
    try {
      await setSessionCookie(session.token, session.expiresAt);
    } catch {
      // Outside Next.js request context (unit/integration tests).
    }
  }

  await recordAuditEvent({
    eventType: "USER_REGISTERED",
    actorUserId: user.id,
    payload: { email },
  });

  return {
    userId: user.id,
    sessionId: session.sessionId,
    token: session.token,
    expiresAt: session.expiresAt,
  };
}
