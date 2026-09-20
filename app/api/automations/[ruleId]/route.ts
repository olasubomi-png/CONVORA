import { requireAuthenticatedUser } from "@/lib/authz/context";
import {
  getAutomationRule,
  setRuleEnabled,
  deleteAutomationRule,
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
      z.object({ enabled: z.boolean() }),
      body,
    );
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
