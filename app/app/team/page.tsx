import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listTeams } from "@/lib/teams/service";
import { getOrgWorkload } from "@/lib/teams/workload";
import { Container } from "@/components/ui/container";
import { TeamOpsPanel } from "@/components/team/team-ops-panel";
import Link from "next/link";

export const metadata = { title: "Team — CONVORA" };

export default async function TeamPage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Team</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">Create an organization first.</p>
        <Link href="/app/organization" className="mt-4 inline-block text-sm text-[#1f4e3d]">
          Create organization
        </Link>
      </Container>
    );
  }

  const [teams, workload] = await Promise.all([
    listTeams(auth.user.id, primary.organizationId),
    getOrgWorkload(auth.user.id, primary.organizationId),
  ]);

  return (
    <Container className="py-10">
      <h1 className="text-2xl tracking-tight">Team operations</h1>
      <p className="mt-1 text-sm text-[#5c5c5c]">
        Presence, teams, and workload for your organization.
      </p>
      <div className="mt-8">
        <TeamOpsPanel
          organizationId={primary.organizationId}
          membershipId={primary.id}
          role={primary.role}
          teams={teams.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
          }))}
          unassignedCount={workload.unassignedCount}
          presence={workload.presence.map((p) => ({
            membershipId: p.membershipId,
            status: p.status,
            lastSeenAt: p.lastSeenAt.toISOString(),
          }))}
          byAgent={workload.byAgent}
        />
      </div>
    </Container>
  );
}
