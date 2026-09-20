import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listAutomationRules, listExecutions } from "@/lib/automation/rules";
import { Container } from "@/components/ui/container";
import { AutomationsPanel } from "@/components/automation/automations-panel";
import Link from "next/link";

export const metadata = { title: "Automations — CONVORA" };

export default async function AutomationsPage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Automations</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">Create an organization first.</p>
        <Link href="/app/organization" className="mt-4 inline-block text-sm text-[#1f4e3d]">
          Create organization
        </Link>
      </Container>
    );
  }

  const [rules, executions] = await Promise.all([
    listAutomationRules(auth.user.id, primary.organizationId),
    listExecutions(auth.user.id, primary.organizationId, 20),
  ]);

  return (
    <Container className="py-10">
      <h1 className="text-2xl tracking-tight">Automations</h1>
      <p className="mt-1 text-sm text-[#5c5c5c]">
        Deterministic rules that react to CONVORA events. External messaging is not automated.
      </p>
      <div className="mt-8">
        <AutomationsPanel
          organizationId={primary.organizationId}
          role={primary.role}
          rules={rules.map((r) => ({
            id: r.id,
            name: r.name,
            triggerType: r.triggerType,
            enabled: r.enabled,
            priority: r.priority,
          }))}
          executions={executions.map((e) => ({
            id: e.id,
            ruleId: e.ruleId,
            triggerType: e.triggerType,
            status: e.status,
            startedAt: e.startedAt.toISOString(),
          }))}
        />
      </div>
    </Container>
  );
}
