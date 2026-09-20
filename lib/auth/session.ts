import { and, eq, gt, isNull } from "drizzle-orm";
import { getDatabase } from "@/db";
import { sessions, users } from "@/db/schema";
import type { User } from "@/db/schema";
import { AuthenticationError } from "@/lib/errors";
import { clearSessionCookie, getSessionDurationMs, readSessionToken, setSessionCookie } from "@/lib/auth/cookies";
import { generateSessionToken, hashSessionToken } from "@/lib/auth/tokens";

export type SessionUser = Pick<User, "id" | "email" | "fullName" | "avatarUrl" | "status">;
export type ActiveSession = { sessionId: string; user: SessionUser; expiresAt: Date };

export async function createSessionRecord(userId: string): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const db = getDatabase();
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + getSessionDurationMs());
  const [row] = await db.insert(sessions).values({ userId, tokenHash, expiresAt }).returning({ id: sessions.id });
  if (!row) throw new Error("Failed to create session");
  return { token, sessionId: row.id, expiresAt };
}

export async function createSession(userId: string) {
  const record = await createSessionRecord(userId);
  await setSessionCookie(record.token, record.expiresAt);
  return record;
}

async function loadSessionByTokenHash(tokenHash: string): Promise<ActiveSession | null> {
  const db = getDatabase();
  const now = new Date();
  const rows = await db
    .select({
      sessionId: sessions.id, expiresAt: sessions.expiresAt,
      userId: users.id, email: users.email, fullName: users.fullName,
      avatarUrl: users.avatarUrl, status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt), gt(sessions.expiresAt, now), eq(users.status, "ACTIVE")))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.sessionId, expiresAt: row.expiresAt,
    user: { id: row.userId, email: row.email, fullName: row.fullName, avatarUrl: row.avatarUrl, status: row.status },
  };
}

export async function getSession(): Promise<ActiveSession | null> {
  const token = await readSessionToken();
  if (!token) return null;
  return loadSessionByTokenHash(hashSessionToken(token));
}

export async function requireSession(): Promise<ActiveSession> {
  const session = await getSession();
  if (!session) throw new AuthenticationError();
  return session;
}

export async function revokeSession(sessionId: string): Promise<void> {
  const db = getDatabase();
  await db.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeCurrentSession(): Promise<void> {
  const session = await getSession();
  if (session) await revokeSession(session.sessionId);
  await clearSessionCookie();
}

export async function getSessionByToken(token: string): Promise<ActiveSession | null> {
  return loadSessionByTokenHash(hashSessionToken(token));
}
