import { z } from "zod";
import {
  AUTOMATION_TRIGGERS,
  CONDITION_OPERATORS,
  type AutomationAction,
  type AutomationCondition,
} from "@/lib/automation/types";
import { ValidationError } from "@/lib/errors";

const ALLOWED_FIELDS = [
  "conversation.status",
  "conversation.priority",
  "conversation.channel",
  "conversation.assignedToMembershipId",
  "customer.displayName",
  "customer.email",
  "customer.phone",
  "message.direction",
  "message.body",
  "event.type",
] as const;

const conditionSchema = z
  .object({
    field: z.enum(ALLOWED_FIELDS),
    operator: z.enum(CONDITION_OPERATORS),
    value: z.unknown().optional(),
  })
  .superRefine((c, ctx) => {
    if (
      (c.operator === "exists" || c.operator === "not_exists") &&
      c.value !== undefined
    ) {
      // value optional for exists
      return;
    }
    if (
      c.operator === "in" ||
      c.operator === "not_in"
    ) {
      if (!Array.isArray(c.value)) {
        ctx.addIssue({
          code: "custom",
          message: `${c.operator} requires an array value`,
        });
      }
      return;
    }
    if (
      c.operator === "contains" ||
      c.operator === "starts_with" ||
      c.operator === "ends_with"
    ) {
      if (typeof c.value !== "string" || c.value.length > 500) {
        ctx.addIssue({
          code: "custom",
          message: `${c.operator} requires a string value (max 500)`,
        });
      }
    }
  });

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("set_conversation_status"),
    status: z.enum(["OPEN", "PENDING", "CLOSED"]),
  }),
  z.object({
    type: z.literal("set_priority"),
    priority: z.enum(["NORMAL", "HIGH", "URGENT"]),
  }),
  z.object({
    type: z.literal("add_internal_note"),
    body: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal("assign_conversation"),
    membershipId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("add_tag"),
    tagId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("remove_tag"),
    tagId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("add_customer_tag"),
    tagId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("remove_customer_tag"),
    tagId: z.string().uuid(),
  }),
]);

export function parseConditionsStrict(raw: unknown): AutomationCondition[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError("conditions must be an array.");
  }
  if (raw.length > 50) {
    throw new ValidationError("Too many conditions.");
  }
  const result: AutomationCondition[] = [];
  for (const item of raw) {
    const parsed = conditionSchema.safeParse(item);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Invalid condition.",
      );
    }
    result.push(parsed.data);
  }
  return result;
}

export function parseActionsStrict(raw: unknown): z.infer<typeof actionSchema>[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError("actions must be an array.");
  }
  if (raw.length > 20) {
    throw new ValidationError("Too many actions.");
  }
  const result: AutomationAction[] = [];
  for (const item of raw) {
    const parsed = actionSchema.safeParse(item);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "Invalid action.",
      );
    }
    result.push(parsed.data);
  }
  return result;
}

export function parseTriggerType(raw: string): string {
  if (!(AUTOMATION_TRIGGERS as readonly string[]).includes(raw)) {
    throw new ValidationError("Invalid trigger type.");
  }
  return raw;
}
