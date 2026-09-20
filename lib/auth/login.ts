import { eq } from "drizzle-orm";
import { getDatabase } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionRecord } from "@/lib/auth/session";
import { setSessionCookie } from "@/lib/auth/cookies";
import { recordAuditEvent } from "@/lib/audit";
import { AuthenticationError } from "@/lib/errors";
import { normalizeEmail, type LoginInput } from "@/lib/validation/auth";

export async function loginUser(input: LoginInput, options?: { setCookie?: boolean }) {
  const db = getDatabase();
  const email = normalizeEmail(input.email);
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  const passwordHash = user?.passwordHash ?? "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const valid = await verifyPassword(passwordHash, input.password);
  if (!user || !valid || user.status !== "ACTIVE") throw new AuthenticationError("Invalid email or password.");
  await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  const session = await createSessionRecord(user.id);
  if (options?.setCookie !== false) {
    try { await setSessionCookie(session.token, session.expiresAt); } catch { /* tests */ }
  }
  await recordAuditEvent({ eventType: "USER_LOGIN", actorUserId: user.id, payload: {} });
  return { userId: user.id, sessionId: session.sessionId, token: session.token, expiresAt: session.expiresAt };
}
