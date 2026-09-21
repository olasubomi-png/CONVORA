import { requireAuthenticatedUser } from "@/lib/authz/context";
import { requirePermission } from "@/lib/authz/permissions";
import {
  createAutomationRule,
  listAutomationRules,
  listExecutions,
} from "@/lib/automation/rules";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";
import { ValidationError } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId");
    if (!organizationId) {
      throw new ValidationError("organizationId is required.");
    }
    await requirePermission(auth.user.id, organizationId, "automations.view");
    if (url.searchParams.get("executions") === "1") {
      const executions = await listExecutions(auth.user.id, organizationId);
      return jsonOk({ executions });
    }
    const rules = await listAutomationRules(auth.user.id, organizationId);
    return jsonOk({ rules });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser();
    const body = await request.json();
    const input = parseInput(
      z.object({
        organizationId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        description: z.string().max(500).optional(),
        triggerType: z.string().min(1),
        priority: z.number().int().min(0).max(10_000).optional(),
        conditions: z.array(z.unknown()),
        actions: z.array(z.unknown()),
        enabled: z.boolean().optional(),
      }),
      body,
    );
    await requirePermission(auth.user.id, input.organizationId, "automations.manage");
    const result = await createAutomationRule(
      auth.user.id,
      input.organizationId,
      input,
    );
    return jsonOk(result, 201);
  } catch (error) {
    return jsonError(error);
  }
}
