export const AUTOMATION_TRIGGERS = [
  "conversation.created",
  "conversation.message_received",
  "conversation.message_sent",
  "conversation.assigned",
  "conversation.unassigned",
  "conversation.status_changed",
  "conversation.priority_changed",
  "customer.created",
  "customer.updated",
  "customer.tag_added",
  "customer.tag_removed",
] as const;

export type AutomationTriggerType = (typeof AUTOMATION_TRIGGERS)[number];

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "starts_with",
  "ends_with",
  "greater_than",
  "less_than",
  "exists",
  "not_exists",
  "in",
  "not_in",
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export type AutomationCondition = {
  field: string;
  operator: ConditionOperator;
  value?: unknown;
};

export type AutomationAction =
  | { type: "set_conversation_status"; status: string }
  | { type: "set_priority"; priority: string }
  | { type: "add_internal_note"; body: string }
  | { type: "assign_conversation"; membershipId: string }
  | { type: "add_tag"; tag: string }
  | { type: "remove_tag"; tag: string };

/** Safe context exposed to condition evaluation — no code execution. */
export type AutomationContext = {
  organizationId: string;
  conversationId?: string;
  customerId?: string;
  conversation?: {
    status?: string;
    priority?: string;
    channel?: string;
    assignedToMembershipId?: string | null;
  };
  customer?: {
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  message?: {
    direction?: string;
    body?: string;
  };
  event: {
    type: AutomationTriggerType;
    key: string;
  };
  /** Automation recursion depth (0 = original external/domain event). */
  depth: number;
};

export const MAX_AUTOMATION_DEPTH = 3;
