/**
 * Canonical entitlement keys. Authorization checks must use these keys,
 * not plan code string comparisons.
 */
export const ENTITLEMENT_KEYS = {
  CHANNEL_FACEBOOK: "channel.facebook",
  CHANNEL_WEB_CHAT: "channel.web_chat",
  CHANNEL_WHATSAPP: "channel.whatsapp",
  CHANNEL_INSTAGRAM: "channel.instagram",
  AI_ENABLED: "ai.enabled",
  AI_MONTHLY_LIMIT: "ai.monthly_limit",
  AUTOMATION_ENABLED: "automation.enabled",
  ANALYTICS_ADVANCED: "analytics.advanced",
  AGENTS_MAX: "agents.max",
  CUSTOMERS_MAX: "customers.max",
  CONVERSATIONS_MONTHLY_LIMIT: "conversations.monthly_limit",
} as const;

export type EntitlementKey =
  (typeof ENTITLEMENT_KEYS)[keyof typeof ENTITLEMENT_KEYS];

/** Meter keys for usage tables. */
export const METER_KEYS = {
  AI_GENERATIONS: "ai.generations",
  CONVERSATIONS: "conversations.created",
} as const;
