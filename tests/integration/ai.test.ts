import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users, messages } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { createOrganizationWithOwner } from "@/lib/orgs/create";
import { createCustomer } from "@/lib/customers/create";
import { createConversation } from "@/lib/conversations/create";
import { sendAgentMessage } from "@/lib/conversations/messages";
import {
  generateConversationSummary,
  generateSuggestedReply,
  generateIntent,
} from "@/lib/ai/generate";
import { resolveSuggestion } from "@/lib/ai/suggestions";
import { resetAiProviderCache, setAiProviderForTests } from "@/lib/ai/provider";
import { MockAiProvider } from "@/lib/ai/providers/mock";
import { NotFoundError } from "@/lib/errors";
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

async function setupConversation(email: string) {
  const owner = await seedUser(email);
  const org = await createOrganizationWithOwner(owner.id, {
    name: email,
    slug: email.replace(/[^a-z0-9]/g, "-").slice(0, 20),
  });
  const customer = await createCustomer(org.organizationId, owner.id, {
    displayName: "Cust",
  });
  const conversation = await createConversation(owner.id, org.organizationId, {
    customerId: customer.id,
    initialMessage: "I need help with my account",
  });
  await sendAgentMessage(owner.id, conversation.id, "I can help with that.");
  return { owner, org, customer, conversation };
}

describe("AI copilot", () => {
  it("generates conversation summary with usage", async () => {
    const { owner, conversation } = await setupConversation("ai1@example.com");
    const out = await generateConversationSummary(owner.id, conversation.id);
    expect(out.result.summary).toBeTruthy();
    expect(out.generation.status).toBe("SUCCEEDED");
    expect(out.generation.totalTokens).toBeGreaterThan(0);
  });

  it("creates draft suggestion without customer message", async () => {
    const { owner, conversation } = await setupConversation("ai2@example.com");
    const before = await getTestDb()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    const out = await generateSuggestedReply(owner.id, conversation.id);
    expect(out.suggestion?.status).toBe("PENDING");
    const after = await getTestDb()
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id));
    expect(after.length).toBe(before.length);
  });

  it("accepts suggestion without auto-sending", async () => {
    const { owner, conversation } = await setupConversation("ai3@example.com");
    const out = await generateSuggestedReply(owner.id, conversation.id);
    const resolved = await resolveSuggestion(
      owner.id,
      out.suggestion!.id,
      "ACCEPT",
    );
    expect(resolved?.status).toBe("ACCEPTED");
  });

  it("blocks cross-tenant AI", async () => {
    const a = await setupConversation("ai-a@example.com");
    const b = await seedUser("ai-b@example.com");
    await createOrganizationWithOwner(b.id, { name: "B", slug: "ai-b-org" });
    await expect(
      generateConversationSummary(b.id, a.conversation.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("classifies intent", async () => {
    const { owner, conversation } = await setupConversation("ai4@example.com");
    const out = await generateIntent(owner.id, conversation.id);
    expect(out.result.intent).toBe("SUPPORT");
  });
});
