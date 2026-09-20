import { and, asc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDatabase } from "@/db";
import {
  automationRules,
  automationRuleDefinitions,
  automationExecutions,
} from "@/db/schema";
import type {
  AutomationAction,
  AutomationCondition,
  AutomationContext,
  AutomationTriggerType,
} from "@/lib/automation/types";
import { MAX_AUTOMATION_DEPTH } from "@/lib/automation/types";
import { evaluateAllConditions } from "@/lib/automation/conditions";
import { executeAction } from "@/lib/automation/actions";
import { recordAuditEvent } from "@/lib/audit";
import { isUniqueViolation } from "@/lib/db-errors";

function buildIdempotencyKey(
  organizationId: string,
  ruleId: string,
  eventKey: string,
): string {
  return createHash("sha256")
    .update(`${organizationId}:${ruleId}:${eventKey}`)
    .digest("hex");
}

/**
 * Emit a domain event into the automation engine.
 * Organization-scoped; never loads rules from other orgs.
 * Loop protection: depth >= MAX_AUTOMATION_DEPTH → skip.
 */
export async function emitAutomationEvent(input: {
  organizationId: string;
  triggerType: AutomationTriggerType;
  eventKey: string;
  context: Omit<AutomationContext, "organizationId" | "event" | "depth"> & {
    depth?: number;
  };
}): Promise<{ executions: number; skipped: number }> {
  const depth = input.context.depth ?? 0;
  if (depth >= MAX_AUTOMATION_DEPTH) {
    return { executions: 0, skipped: 1 };
  }

  const db = getDatabase();
  const rules = await db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.organizationId, input.organizationId),
        eq(automationRules.triggerType, input.triggerType),
        eq(automationRules.enabled, true),
      ),
    )
    .orderBy(asc(automationRules.priority), asc(automationRules.id));

  let executions = 0;
  let skipped = 0;

  for (const rule of rules) {
    const [definition] = await db
      .select()
      .from(automationRuleDefinitions)
      .where(eq(automationRuleDefinitions.ruleId, rule.id))
      .limit(1);

    const conditions = (definition?.conditions ??
      []) as AutomationCondition[];
    const actions = (definition?.actions ?? []) as AutomationAction[];

    const ctx: AutomationContext = {
      organizationId: input.organizationId,
      conversationId: input.context.conversationId,
      customerId: input.context.customerId,
      actorMembershipId: rule.createdByMembershipId,
      conversation: input.context.conversation,
      customer: input.context.customer,
      message: input.context.message,
      event: { type: input.triggerType, key: input.eventKey },
      depth,
    };

    let matched = false;
    try {
      matched = evaluateAllConditions(conditions, ctx);
    } catch {
      skipped += 1;
      continue;
    }
    if (!matched) {
      skipped += 1;
      continue;
    }

    const idempotencyKey = buildIdempotencyKey(
      input.organizationId,
      rule.id,
      input.eventKey,
    );

    // Claim execution row (idempotent)
    let executionId: string;
    try {
      const [row] = await db
        .insert(automationExecutions)
        .values({
          organizationId: input.organizationId,
          ruleId: rule.id,
          triggerType: input.triggerType,
          idempotencyKey,
          status: "RUNNING",
          depth,
          eventPayload: {
            eventKey: input.eventKey,
            conversationId: ctx.conversationId,
            customerId: ctx.customerId,
          },
        })
        .returning();
      if (!row) {
        skipped += 1;
        continue;
      }
      executionId = row.id;
    } catch (e) {
      if (isUniqueViolation(e)) {
        skipped += 1;
        continue;
      }
      throw e;
    }

    try {
      const results = [];
      for (const action of actions) {
        results.push(await executeAction(action, ctx));
      }
      await db
        .update(automationExecutions)
        .set({
          status: "SUCCEEDED",
          result: { actions: results },
          completedAt: new Date(),
        })
        .where(eq(automationExecutions.id, executionId));

      await recordAuditEvent({
        eventType: "AUTOMATION_EXECUTED",
        organizationId: input.organizationId,
        payload: { ruleId: rule.id, executionId, triggerType: input.triggerType },
      });
      executions += 1;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message.slice(0, 300) : "failed";
      await db
        .update(automationExecutions)
        .set({
          status: "FAILED",
          failureReason: reason,
          completedAt: new Date(),
        })
        .where(eq(automationExecutions.id, executionId));
      await recordAuditEvent({
        eventType: "AUTOMATION_FAILED",
        organizationId: input.organizationId,
        payload: { ruleId: rule.id, executionId },
      });
    }
  }

  return { executions, skipped };
}
