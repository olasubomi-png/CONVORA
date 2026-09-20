import { and, asc, eq, desc } from "drizzle-orm";
import { getDatabase } from "@/db";
import {
  automationRules,
  automationRuleDefinitions,
  automationExecutions,
} from "@/db/schema";
import { getActiveMembership } from "@/lib/authz/membership";
import { isAdminRole } from "@/lib/authz/roles";
import { recordAuditEvent } from "@/lib/audit";
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@/lib/errors";
import {
  AUTOMATION_TRIGGERS,
  CONDITION_OPERATORS,
  type AutomationAction,
  type AutomationCondition,
  type AutomationTriggerType,
} from "@/lib/automation/types";

async function requireAdmin(actorUserId: string, organizationId: string) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership || !isAdminRole(membership.role)) {
    throw new AuthorizationError(
      "Only admins or owners can manage automations.",
    );
  }
  return membership;
}

function parseConditions(raw: unknown): AutomationCondition[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError("conditions must be an array.");
  }
  return raw.map((c) => {
    if (!c || typeof c !== "object") {
      throw new ValidationError("Invalid condition.");
    }
    const cond = c as Record<string, unknown>;
    if (typeof cond.field !== "string" || typeof cond.operator !== "string") {
      throw new ValidationError("Condition requires field and operator.");
    }
    if (!(CONDITION_OPERATORS as readonly string[]).includes(cond.operator)) {
      throw new ValidationError(`Unsupported operator: ${cond.operator}`);
    }
    return {
      field: cond.field,
      operator: cond.operator as AutomationCondition["operator"],
      value: cond.value,
    };
  });
}

function parseActions(raw: unknown): AutomationAction[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError("actions must be an array.");
  }
  return raw.map((a) => {
    if (!a || typeof a !== "object") {
      throw new ValidationError("Invalid action.");
    }
    const act = a as Record<string, unknown>;
    if (typeof act.type !== "string") {
      throw new ValidationError("Action requires type.");
    }
    return act as AutomationAction;
  });
}

export async function createAutomationRule(
  actorUserId: string,
  organizationId: string,
  input: {
    name: string;
    description?: string;
    triggerType: string;
    priority?: number;
    conditions: unknown;
    actions: unknown;
    enabled?: boolean;
  },
) {
  const membership = await requireAdmin(actorUserId, organizationId);
  const name = input.name.trim();
  if (!name || name.length > 120) {
    throw new ValidationError("name is required (max 120).");
  }
  if (!(AUTOMATION_TRIGGERS as readonly string[]).includes(input.triggerType)) {
    throw new ValidationError("Invalid trigger type.");
  }
  const conditions = parseConditions(input.conditions);
  const actions = parseActions(input.actions);

  const db = getDatabase();
  return db.transaction(async (tx) => {
    const [rule] = await tx
      .insert(automationRules)
      .values({
        organizationId,
        name,
        description: input.description?.trim() || null,
        triggerType: input.triggerType as AutomationTriggerType,
        priority: input.priority ?? 100,
        enabled: input.enabled ?? true,
        createdByMembershipId: membership.id,
      })
      .returning();
    if (!rule) throw new Error("Failed to create rule");

    await tx.insert(automationRuleDefinitions).values({
      organizationId,
      ruleId: rule.id,
      conditions,
      actions,
    });

    await recordAuditEvent(
      {
        eventType: "AUTOMATION_RULE_CREATED",
        actorUserId,
        organizationId,
        payload: { ruleId: rule.id, name, triggerType: input.triggerType },
      },
      tx,
    );

    return { rule, conditions, actions };
  });
}

export async function listAutomationRules(
  actorUserId: string,
  organizationId: string,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  const db = getDatabase();
  return db
    .select()
    .from(automationRules)
    .where(eq(automationRules.organizationId, organizationId))
    .orderBy(asc(automationRules.priority), asc(automationRules.id));
}

export async function getAutomationRule(
  actorUserId: string,
  ruleId: string,
) {
  const db = getDatabase();
  const [rule] = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.id, ruleId))
    .limit(1);
  if (!rule) throw new NotFoundError("Rule not found.");
  const membership = await getActiveMembership(
    actorUserId,
    rule.organizationId,
  );
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  const [definition] = await db
    .select()
    .from(automationRuleDefinitions)
    .where(eq(automationRuleDefinitions.ruleId, ruleId))
    .limit(1);
  return { rule, definition };
}

export async function setRuleEnabled(
  actorUserId: string,
  ruleId: string,
  enabled: boolean,
) {
  const db = getDatabase();
  const [rule] = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.id, ruleId))
    .limit(1);
  if (!rule) throw new NotFoundError("Rule not found.");
  await requireAdmin(actorUserId, rule.organizationId);

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(automationRules)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(automationRules.id, ruleId),
          eq(automationRules.organizationId, rule.organizationId),
        ),
      )
      .returning();
    await recordAuditEvent(
      {
        eventType: enabled
          ? "AUTOMATION_RULE_ENABLED"
          : "AUTOMATION_RULE_DISABLED",
        actorUserId,
        organizationId: rule.organizationId,
        payload: { ruleId },
      },
      tx,
    );
    return updated;
  });
}

export async function deleteAutomationRule(
  actorUserId: string,
  ruleId: string,
) {
  const db = getDatabase();
  const [rule] = await db
    .select()
    .from(automationRules)
    .where(eq(automationRules.id, ruleId))
    .limit(1);
  if (!rule) throw new NotFoundError("Rule not found.");
  await requireAdmin(actorUserId, rule.organizationId);

  return db.transaction(async (tx) => {
    await tx
      .delete(automationRules)
      .where(
        and(
          eq(automationRules.id, ruleId),
          eq(automationRules.organizationId, rule.organizationId),
        ),
      );
    await recordAuditEvent(
      {
        eventType: "AUTOMATION_RULE_DELETED",
        actorUserId,
        organizationId: rule.organizationId,
        payload: { ruleId },
      },
      tx,
    );
  });
}

export async function listExecutions(
  actorUserId: string,
  organizationId: string,
  limit = 50,
) {
  const membership = await getActiveMembership(actorUserId, organizationId);
  if (!membership) {
    throw new AuthorizationError(
      "You are not an active member of this organization.",
    );
  }
  const db = getDatabase();
  return db
    .select({
      id: automationExecutions.id,
      ruleId: automationExecutions.ruleId,
      triggerType: automationExecutions.triggerType,
      status: automationExecutions.status,
      startedAt: automationExecutions.startedAt,
      completedAt: automationExecutions.completedAt,
      failureReason: automationExecutions.failureReason,
    })
    .from(automationExecutions)
    .where(eq(automationExecutions.organizationId, organizationId))
    .orderBy(desc(automationExecutions.startedAt))
    .limit(Math.min(limit, 100));
}
