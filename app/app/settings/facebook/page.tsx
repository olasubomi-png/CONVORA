import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listChannelInstallations } from "@/lib/channels/installations";
import { Container } from "@/components/ui/container";
import { FacebookSettings } from "@/components/channels/facebook-settings";
import Link from "next/link";
import { FACEBOOK_MESSENGER_PROVIDER } from "@/lib/channels/providers/facebook/adapter";

export const metadata = { title: "Facebook Messenger — CONVORA" };

export default async function FacebookSettingsPage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Facebook Messenger</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">Create an organization first.</p>
        <Link
          href="/app/organization"
          className="mt-4 inline-block text-sm text-[#1f4e3d]"
        >
          Create organization
        </Link>
      </Container>
    );
  }

  const all = await listChannelInstallations(
    auth.user.id,
    primary.organizationId,
  );
  const installations = all.filter(
    (i) => i.provider === FACEBOOK_MESSENGER_PROVIDER,
  );

  return (
    <Container className="py-10">
      <h1 className="text-2xl tracking-tight">Facebook Messenger</h1>
      <p className="mt-1 text-sm text-[#5c5c5c]">
        Connect a Facebook Page. Inbound and outbound messages use the shared
        CONVORA inbox.
      </p>
      <div className="mt-8">
        <FacebookSettings
          organizationId={primary.organizationId}
          installations={installations}
          webhookUrl={`${process.env.APP_URL ?? ""}/api/webhooks/facebook`}
        />
      </div>
    </Container>
  );
}
