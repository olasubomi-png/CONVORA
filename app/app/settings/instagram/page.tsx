import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listChannelInstallations } from "@/lib/channels/installations";
import { Container } from "@/components/ui/container";
import { InstagramSettings } from "@/components/channels/instagram-settings";
import Link from "next/link";
import { INSTAGRAM_MESSAGING_PROVIDER } from "@/lib/channels/providers/instagram/adapter";

export const metadata = { title: "Instagram Messaging — CONVORA" };

export default async function InstagramSettingsPage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Instagram Messaging</h1>
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
    (i) => i.provider === INSTAGRAM_MESSAGING_PROVIDER,
  );

  return (
    <Container className="py-10">
      <h1 className="text-2xl tracking-tight">Instagram Messaging</h1>
      <p className="mt-1 text-sm text-[#5c5c5c]">
        Connect an Instagram professional account linked to a Facebook Page.
        Production messaging may require Meta App Review.
      </p>
      <div className="mt-8">
        <InstagramSettings organizationId={primary.organizationId}
          installations={installations}
          webhookUrl={`${process.env.APP_URL ?? ""}/api/webhooks/instagram`}
          metaConfigured={Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET)}
        />
      </div>
    </Container>
  );
}
