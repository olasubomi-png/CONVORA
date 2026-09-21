import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  memberships,
  channelInstallations,
  sessions,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import {
  createSessionRecord,
  getSessionByToken,
  revokeSession,
} from "@/lib/auth/session";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import { requireOrgConversation } from "@/lib/conversations/access";
import { requireOrgCustomer } from "@/lib/customers/access";
import { listChannelInstallations } from "@/lib/channels/installations";
import { listAutomationRules } from "@/lib/automation/rules";
import { getAnalyticsOverview } from "@/lib/analytics/queries";
import { parseAnalyticsFilters } from "@/lib/analytics/filters";
import { overviewToCsv } from "@/lib/analytics/export";
import { requirePermission } from "@/lib/authz/permissions";
import { createWhatsAppInstallation } from "@/lib/channels/providers/whatsapp/installations";
import { AuthorizationError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";

beforeAll(() => {
  setupTestEnv();
});

beforeEach(async () => {
  await truncateAllTables();
});

async function seedUser(email: string) {
  const passwordHash = await hashPassword("securepass1");
  const [user] = await getTestDb()
    .insert(users)
    .values({ email, passwordHash, fullName: email })
    .returning();
  if (!user) throw new Error("user");
  return user;
}

describe("session boundaries", () => {
  it("rejects revoked and expired sessions", async () => {
    const user = await seedUser("sm-sess@example.com");
    const record = await createSessionRecord(user.id);
    expect(await getSessionByToken(record.token)).not.toBeNull();
    await revokeSession(record.sessionId);
    expect(await getSessionByToken(record.token)).toBeNull();

    const expired = await createSessionRecord(user.id);
    await getTestDb()
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(sessions.id, expired.sessionId));
    expect(await getSessionByToken(expired.token)).toBeNull();
  });
});

describe("cross-tenant IDOR", () => {
  it("blocks conversation, customer, channels, analytics, automations", async () => {
    const a = await seedUser("sm-a@example.com");
    const b = await seedUser("sm-b@example.com");
    await createOrganizationWithOwner(a.id, {
      name: "SMA",
      slug: "sm-a",
    });
    const orgB = await createOrganizationWithOwner(b.id, {
      name: "SMB",
      slug: "sm-b",
    });
    const customerB = await createCustomer(orgB.organizationId, b.id, {
      displayName: "Secret",
    });
    const convB = await createConversation(b.id, orgB.organizationId, {
      customerId: customerB.id,
      initialMessage: "private",
    });

    await expect(requireOrgConversation(a.id, convB.id)).rejects.toThrow();
    await expect(requireOrgCustomer(a.id, customerB.id)).rejects.toThrow();

    await expect(
      listChannelInstallations(a.id, orgB.organizationId),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(
      listAutomationRules(a.id, orgB.organizationId),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(
      getAnalyticsOverview(
        a.id,
        parseAnalyticsFilters({
          organizationId: orgB.organizationId,
          preset: "today",
        }),
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(
      requirePermission(a.id, orgB.organizationId, "org.view"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("role escalation", () => {
  it("agent cannot manage channels or automations", async () => {
    const owner = await seedUser("sm-o@example.com");
    const agent = await seedUser("sm-ag@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "SMO",
      slug: "sm-o",
    });
    await getTestDb().insert(memberships).values({
      organizationId: org.organizationId,
      userId: agent.id,
      role: "AGENT",
      status: "ACTIVE",
    });

    await expect(
      requirePermission(agent.id, org.organizationId, "channels.manage"),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      requirePermission(agent.id, org.organizationId, "automations.manage"),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      requirePermission(agent.id, org.organizationId, "members.manage"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("secret non-disclosure", () => {
  it("WhatsApp installation responses omit access tokens", async () => {
    const owner = await seedUser("sm-wa@example.com");
    const org = await createOrganizationWithOwner(owner.id, {
      name: "SMWA",
      slug: "sm-wa",
    });
    const installation = await createWhatsAppInstallation(
      owner.id,
      org.organizationId,
      {
        displayName: "WA",
        credentials: {
          accessToken: "EAABsupersecrettokenvalue12",
          appSecret: "appsecretvalue12",
          verifyToken: "verifytokenvalue12",
          phoneNumberId: "1234567890",
        },
      },
    );
    const json = JSON.stringify(installation);
    expect(json).not.toContain("EAABsupersecrettokenvalue12");
    expect(json).not.toContain("appsecretvalue12");
    expect(json).not.toContain("verifytokenvalue12");
    expect(installation).not.toHaveProperty("encryptedConfig");

    const rows = await getTestDb()
      .select()
      .from(channelInstallations)
      .where(eq(channelInstallations.id, installation.id));
    expect(rows[0]?.encryptedConfig).toBeTruthy();

    const csv = overviewToCsv(
      await getAnalyticsOverview(
        owner.id,
        parseAnalyticsFilters({
          organizationId: org.organizationId,
          preset: "today",
        }),
      ),
    );
    expect(csv).not.toContain("EAABsupersecrettokenvalue12");
  });
});
