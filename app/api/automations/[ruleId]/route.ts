import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  getAutomationRule,
  setRuleEnabled,
  deleteAutomationRule,
  updateAutomationRule,
} from "@/lib/automation/rules";
import { parseInput, z } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/api/response";

type Params = { params: Promise<{ ruleId: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { ruleId } = await params;
    const result = await getAutomationRule(auth.user.id, ruleId);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { ruleId } = await params;
    const body = await request.json();
    const input = parseInput(
      z.object({
        enabled: z.boolean().optional(),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().max(500).nullable().optional(),
        triggerType: z.string().optional(),
        priority: z.number().int().min(0).max(10000).optional(),
        conditions: z.array(z.unknown()).optional(),
        actions: z.array(z.unknown()).optional(),
      }),
      body,
    );
    if (
      input.name !== undefined ||
      input.description !== undefined ||
      input.triggerType !== undefined ||
      input.priority !== undefined ||
      input.conditions !== undefined ||
      input.actions !== undefined
    ) {
      const rule = await updateAutomationRule(auth.user.id, ruleId, input);
      return jsonOk({ rule });
    }
    if (input.enabled === undefined) {
      return jsonOk({ ok: true });
    }
    const rule = await setRuleEnabled(auth.user.id, ruleId, input.enabled);
    return jsonOk({ rule });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const auth = await requireAuthenticatedUser();
    const { ruleId } = await params;
    await deleteAutomationRule(auth.user.id, ruleId);
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
