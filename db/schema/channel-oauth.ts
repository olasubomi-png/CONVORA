import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * One-time OAuth state for Meta channel authorization.
 * state_hash is SHA-256 of the opaque state token issued to the browser.
 */
export const channelOauthStates = pgTable(
  "channel_oauth_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stateHash: text("state_hash").notNull(),
    userId: uuid("user_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    /** whatsapp_cloud | meta_messenger | meta_instagram */
    provider: text("provider").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("channel_oauth_states_state_hash_unique").on(t.stateHash),
    index("channel_oauth_states_org_idx").on(t.organizationId),
    index("channel_oauth_states_expires_idx").on(t.expiresAt),
  ],
);
