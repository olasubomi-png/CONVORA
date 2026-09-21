import type { AutomationTriggerType } from "@/lib/automation/types";
import { dispatchDomainEventReliable } from "@/lib/automation/outbox";

/**
 * Reliable domain → automation bridge.
 * Enqueues to outbox then processes synchronously so mutations are not lost.
 */
export async function dispatchAutomationEvent(input: {
  organizationId: string;
  triggerType: AutomationTriggerType;
  eventKey: string;
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
  message?: { direction?: string; body?: string };
  depth?: number;
}): Promise<void> {
  await dispatchDomainEventReliable({
    organizationId: input.organizationId,
    triggerType: input.triggerType,
    eventKey: input.eventKey,
    depth: input.depth,
    payload: {
      conversationId: input.conversationId,
      customerId: input.customerId,
      conversation: input.conversation as Record<string, unknown> | undefined,
      customer: input.customer as Record<string, unknown> | undefined,
      message: input.message as Record<string, unknown> | undefined,
    },
  });
}
