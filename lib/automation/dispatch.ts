import type { AutomationTriggerType } from "@/lib/automation/types";

/**
 * Fire-and-forget safe emit from domain services.
 * Uses dynamic import to avoid circular dependencies.
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
  try {
    const { emitAutomationEvent } = await import("@/lib/automation/engine");
    await emitAutomationEvent({
      organizationId: input.organizationId,
      triggerType: input.triggerType,
      eventKey: input.eventKey,
      context: {
        conversationId: input.conversationId,
        customerId: input.customerId,
        conversation: input.conversation,
        customer: input.customer,
        message: input.message,
        depth: input.depth ?? 0,
      },
    });
  } catch {
    // Domain operations must not fail because automation failed.
    // Execution failures are recorded inside the engine when claimed.
  }
}
