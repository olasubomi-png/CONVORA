import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const planCodeEnum = pgEnum("plan_code", ["STARTER", "PREMIUM"]);
export const billingIntervalEnum = pgEnum("billing_interval", [
  "MONTHLY",
  "YEARLY",
]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "EXPIRED",
]);

/**
 * Catalog plans. Amounts are integer minor units (kobo for NGN).
 * Never store money as floating point.
 */
export const billingPlans = pgTable(
  "billing_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: planCodeEnum("code").notNull(),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("NGN"),
    /** Monthly price in minor units (kobo). */
    monthlyAmountMinor: integer("monthly_amount_minor").notNull(),
    /** Yearly discount basis points (2000 = 20%). */
    yearlyDiscountBps: integer("yearly_discount_bps").notNull().default(2000),
    /** Derived yearly amount in minor units (whole kobo). */
    yearlyAmountMinor: integer("yearly_amount_minor").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("billing_plans_code_unique").on(t.code)],
);

export const billingPlanEntitlements = pgTable(
  "billing_plan_entitlements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => billingPlans.id, { onDelete: "cascade" }),
    /** Machine key e.g. channel.whatsapp, ai.monthly_limit */
    key: text("key").notNull(),
    /** Boolean entitlements use valueBool; numeric limits use valueInt. */
    valueBool: boolean("value_bool"),
    valueInt: integer("value_int"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("billing_plan_entitlements_plan_key_unique").on(t.planId, t.key),
    index("billing_plan_entitlements_plan_id_idx").on(t.planId),
  ],
);

/**
 * One current subscription row per organization (unique organization_id).
 */
export const organizationSubscriptions = pgTable(
  "organization_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => billingPlans.id),
    status: subscriptionStatusEnum("status").notNull(),
    billingInterval: billingIntervalEnum("billing_interval"),
    trialStartsAt: timestamp("trial_starts_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStartsAt: timestamp("current_period_starts_at", {
      withTimezone: true,
    }),
    currentPeriodEndsAt: timestamp("current_period_ends_at", {
      withTimezone: true,
    }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    /** Opaque provider references — never secrets. */
    provider: text("provider"),
    providerCustomerRef: text("provider_customer_ref"),
    providerSubscriptionRef: text("provider_subscription_ref"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("organization_subscriptions_org_unique").on(t.organizationId),
    index("organization_subscriptions_status_idx").on(t.status),
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
      name: "organization_subscriptions_org_fk",
    }).onDelete("cascade"),
  ],
);

export const subscriptionEvents = pgTable(
  "subscription_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => organizationSubscriptions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    fromStatus: subscriptionStatusEnum("from_status"),
    toStatus: subscriptionStatusEnum("to_status"),
    actorUserId: uuid("actor_user_id"),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("subscription_events_org_idx").on(t.organizationId),
    index("subscription_events_subscription_idx").on(t.subscriptionId),
  ],
);

/**
 * Monthly usage counters per organization + meter key.
 * Unique on (organization_id, meter_key, period_start).
 */
export const usageMeters = pgTable(
  "usage_meters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull(),
    meterKey: text("meter_key").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("usage_meters_org_key_period_unique").on(
      t.organizationId,
      t.meterKey,
      t.periodStart,
    ),
    index("usage_meters_org_idx").on(t.organizationId),
    foreignKey({
      columns: [t.organizationId],
      foreignColumns: [organizations.id],
      name: "usage_meters_org_fk",
    }).onDelete("cascade"),
  ],
);

export type BillingPlan = typeof billingPlans.$inferSelect;
export type OrganizationSubscription =
  typeof organizationSubscriptions.$inferSelect;
export type SubscriptionStatus =
  (typeof subscriptionStatusEnum.enumValues)[number];
export type PlanCode = (typeof planCodeEnum.enumValues)[number];
