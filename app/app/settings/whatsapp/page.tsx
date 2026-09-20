import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listChannelInstallations } from "@/lib/channels/installations";
import { Container } from "@/components/ui/container";
import { WhatsAppSettings } from "@/components/channels/whatsapp-settings";
import Link from "next/link";
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/channels/providers/whatsapp/adapter";

export const metadata = { title: "WhatsApp — CONVORA" };

export default async function WhatsAppSettingsPage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">WhatsApp</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">Create an organization first.</p>
        <Link href="/app/organization" className="mt-4 inline-block text-sm text-[#1f4e3d]">
          Create organization
        </Link>
      </Container>
    );
  }

  const all = await listChannelInstallations(
    auth.user.id,
    primary.organizationId,
  );
  const installations = all.filter((i) => i.provider === WHATSAPP_CLOUD_PROVIDER);

  return (
    <Container className="py-10">
      <h1 className="text-2xl tracking-tight">WhatsApp Cloud API</h1>
      <p className="mt-1 text-sm text-[#5c5c5c]">
        Connect a WhatsApp Business phone number. Messages appear in the shared inbox.
      </p>
      <div className="mt-8">
        <WhatsAppSettings
          organizationId={primary.organizationId}
          installations={installations}
          webhookUrl={`${process.env.APP_URL ?? ""}/api/webhooks/whatsapp`}
        />
      </div>
    </Container>
  );
}
