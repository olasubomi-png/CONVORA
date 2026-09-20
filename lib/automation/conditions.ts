import type { AutomationCondition, AutomationContext } from "@/lib/automation/types";
import { CONDITION_OPERATORS } from "@/lib/automation/types";
import { ValidationError } from "@/lib/errors";

const ALLOWED_FIELDS = new Set([
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
]);

function resolveField(ctx: AutomationContext, field: string): unknown {
  if (!ALLOWED_FIELDS.has(field)) {
    throw new ValidationError(`Unsupported condition field: ${field}`);
  }
  const parts = field.split(".");
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function evaluateCondition(
  condition: AutomationCondition,
  ctx: AutomationContext,
): boolean {
  if (!CONDITION_OPERATORS.includes(condition.operator)) {
    throw new ValidationError(`Unsupported operator: ${condition.operator}`);
  }
  const left = resolveField(ctx, condition.field);
  const right = condition.value;

  switch (condition.operator) {
    case "equals":
      return left === right;
    case "not_equals":
      return left !== right;
    case "contains":
      return typeof left === "string" && typeof right === "string"
        ? left.includes(right)
        : false;
    case "starts_with":
      return typeof left === "string" && typeof right === "string"
        ? left.startsWith(right)
        : false;
    case "ends_with":
      return typeof left === "string" && typeof right === "string"
        ? left.endsWith(right)
        : false;
    case "greater_than":
      return typeof left === "number" && typeof right === "number"
        ? left > right
        : false;
    case "less_than":
      return typeof left === "number" && typeof right === "number"
        ? left < right
        : false;
    case "exists":
      return left !== null && left !== undefined && left !== "";
    case "not_exists":
      return left === null || left === undefined || left === "";
    case "in":
      return Array.isArray(right) ? right.includes(left) : false;
    case "not_in":
      return Array.isArray(right) ? !right.includes(left) : false;
    default:
      return false;
  }
}

export function evaluateAllConditions(
  conditions: AutomationCondition[],
  ctx: AutomationContext,
): boolean {
  if (!conditions.length) return true;
  return conditions.every((c) => evaluateCondition(c, ctx));
}
