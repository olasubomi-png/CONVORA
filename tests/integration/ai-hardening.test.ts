import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  aiGenerations,
  aiSuggestions,
  auditEvents,
  messages,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import { generateSuggestedReply } from "@/lib/ai/generate";
import { resolveSuggestion } from "@/lib/ai/suggestions";
import { setAiProviderForTests, resetAiProviderCache } from "@/lib/ai/provider";
import { MockAiProvider } from "@/lib/ai/providers/mock";
import { ConflictError } from "@/lib/errors";
import { getTestDb, setupTestEnv, truncateAllTables } from "../helpers/db";

beforeAll(() => {
  setupTestEnv();
  process.env.AI_PROVIDER = "mock";
  resetAiProviderCache();
  setAiProviderForTests(new MockAiProvider());
});

beforeEach(async () => {
  await truncateAllTables();
  setAiProviderForTests(new MockAiProvider());
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

async function setupConv(email: string) {
  const owner = await seedUser(email);
  const org = await createOrganizationWithOwner(owner.id, {
    name: email,
    slug: email.replace(/[^a-z0-9]/g, "-").slice(0, 18),
  });
  const customer = await createCustomer(org.organizationId, owner.id, {
    displayName: "C",
  });
  const conversation = await createConversation(owner.id, org.organizationId, {
    customerId: customer.id,
    initialMessage: "Help please",
  });
  return { owner, org, customer, conversation };
}

describe("AI DB tenant integrity", () => {
  it("rejects generation with foreign-org conversation", async () => {
    const a = await setupConv("ai-db-a@example.com");
    const b = await setupConv("ai-db-b@example.com");
    await expect(
      getTestDb()
        .insert(aiGenerations)
        .values({
          organizationId: a.org.organizationId,
          conversationId: b.conversation.id,
          provider: "mock",
          model: "mock-1",
          generationType: "CONVERSATION_SUMMARY",
          status: "PENDING",
        }),
    ).rejects.toBeTruthy();
  });

  it("rejects generation with foreign-org customer", async () => {
    const a = await setupConv("ai-db-c@example.com");
    const b = await setupConv("ai-db-d@example.com");
    await expect(
      getTestDb()
        .insert(aiGenerations)
        .values({
          organizationId: a.org.organizationId,
          customerId: b.customer.id,
          provider: "mock",
          model: "mock-1",
          generationType: "CUSTOMER_SUMMARY",
          status: "PENDING",
        }),
    ).rejects.toBeTruthy();
  });

  it("rejects suggestion with foreign-org generation", async () => {
    const a = await setupConv("ai-db-e@example.com");
    const b = await setupConv("ai-db-f@example.com");
    const [genB] = await getTestDb()
      .insert(aiGenerations)
      .values({
        organizationId: b.org.organizationId,
        conversationId: b.conversation.id,
        customerId: b.customer.id,
        provider: "mock",
        model: "mock-1",
        generationType: "SUGGESTED_REPLY",
        status: "SUCCEEDED",
      })
      .returning();
    await expect(
      getTestDb()
        .insert(aiSuggestions)
        .values({
          organizationId: a.org.organizationId,
          generationId: genB!.id,
          conversationId: a.conversation.id,
          customerId: a.customer.id,
          suggestionType: "SUGGESTED_REPLY",
          status: "PENDING",
          content: { draft: "x" },
        }),
    ).rejects.toBeTruthy();
  });
});

describe("suggestion concurrency and audit atomicity", () => {
  it("allows only one concurrent resolution", async () => {
    const { owner, conversation } = await setupConv("ai-conc@example.com");
    const out = await generateSuggestedReply(owner.id, conversation.id);
    const id = out.suggestion!.id;

    const results = await Promise.allSettled([
      resolveSuggestion(owner.id, id, "ACCEPT"),
      resolveSuggestion(owner.id, id, "REJECT"),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(1);
    expect(fail.length).toBe(1);

    const [row] = await getTestDb()
      .select()
      .from(aiSuggestions)
      .where(eq(aiSuggestions.id, id));
    expect(["ACCEPTED", "REJECTED"]).toContain(row?.status);
    expect(row?.resolvedAt).toBeTruthy();
    expect(row?.resolvedByMembershipId).toBeTruthy();

    const audits = await getTestDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "AI_SUGGESTION_ACCEPTED"));
    const auditsR = await getTestDb()
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventType, "AI_SUGGESTION_REJECTED"));
    expect(audits.length + auditsR.length).toBe(1);
  });

  it("does not create customer messages when accepting", async () => {
    const { owner, conversation } = await setupConv("ai-msg@example.com");
    const before = await getTestDb()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    const out = await generateSuggestedReply(owner.id, conversation.id);
    await resolveSuggestion(owner.id, out.suggestion!.id, "ACCEPT");
    const after = await getTestDb()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    expect(after.length).toBe(before.length);
  });

  it("rejects second sequential resolution", async () => {
    const { owner, conversation } = await setupConv("ai-seq@example.com");
    const out = await generateSuggestedReply(owner.id, conversation.id);
    await resolveSuggestion(owner.id, out.suggestion!.id, "ACCEPT");
    await expect(
      resolveSuggestion(owner.id, out.suggestion!.id, "REJECT"),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
