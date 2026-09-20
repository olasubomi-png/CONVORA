import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listInstallations } from "@/lib/web-chat/installations";
import { Container } from "@/components/ui/container";
import { WebChatSettings } from "@/components/web-chat/settings-form";
import Link from "next/link";

export const metadata = { title: "Web Chat — CONVORA" };

export default async function WebChatSettingsPage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Web Chat</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">Create an organization first.</p>
        <Link href="/app/organization" className="mt-4 inline-block text-sm text-[#1f4e3d]">
          Create organization
        </Link>
      </Container>
    );
  }

  const installations = await listInstallations(
    auth.user.id,
    primary.organizationId,
  );

  return (
    <Container className="py-10">
      <h1 className="text-2xl tracking-tight">Web Chat</h1>
      <p className="mt-1 text-sm text-[#5c5c5c]">
        Embed CONVORA on your website. Conversations appear in the shared inbox.
      </p>
      <div className="mt-8">
        <WebChatSettings
          organizationId={primary.organizationId}
          installations={installations.map((i) => ({
            id: i.id,
            name: i.name,
            publicKey: i.publicKey,
            status: i.status,
            allowedOrigins: i.allowedOrigins,
            config: i.config,
          }))}
        />
      </div>
    </Container>
  );
}
