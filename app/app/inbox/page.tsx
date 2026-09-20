import Link from "next/link";
import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listOrganizationConversations } from "@/lib/conversations/list";
import { Container } from "@/components/ui/container";
import { InboxShell } from "@/components/inbox/inbox-shell";

export const metadata = { title: "Inbox — CONVORA" };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ conversation?: string }>;
}) {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];
  const params = await searchParams;

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Inbox</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">
          Create an organization to start receiving conversations.
        </p>
        <Link
          href="/app/organization"
          className="mt-4 inline-block text-sm text-[#1f4e3d] hover:underline"
        >
          Create organization
        </Link>
      </Container>
    );
  }

  const list = await listOrganizationConversations(
    auth.user.id,
    primary.organizationId,
  );

  return (
    <InboxShell
      organizationId={primary.organizationId}
      organizationName={primary.organizationName}
      membershipId={primary.id}
      conversations={list.conversations}
      selectedId={params.conversation}
      userId={auth.user.id}
    />
  );
}
