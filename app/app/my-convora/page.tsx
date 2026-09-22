import Link from "next/link";
import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { getServerEnv } from "@/lib/env";
import { listChannelInstallations } from "@/lib/channels/installations";
import { listInstallations as listWebChat } from "@/lib/web-chat/installations";
import { ShareLinkBar } from "@/components/share/share-link";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "My CONVORA — CONVORA" };

export default async function MyConvoraPage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];
  if (!primary) redirect("/app/onboarding");

  const env = getServerEnv();
  const publicUrl = `${env.APP_URL}/org/${primary.organizationSlug}`;

  const [installations, webChat] = await Promise.all([
    listChannelInstallations(auth.user.id, primary.organizationId),
    listWebChat(auth.user.id, primary.organizationId),
  ]);

  const channels = [
    {
      name: "WhatsApp",
      connected: installations.some(
        (i) =>
          i.status === "ACTIVE" &&
          (i.channel.toUpperCase().includes("WHATSAPP") ||
            i.provider.toUpperCase().includes("WHATSAPP")),
      ),
      href: "/app/settings/whatsapp",
    },
    {
      name: "Facebook",
      connected: installations.some(
        (i) =>
          i.status === "ACTIVE" &&
          (i.channel.toUpperCase().includes("FACEBOOK") ||
            i.channel.toUpperCase().includes("MESSENGER") ||
            i.provider.toUpperCase().includes("FACEBOOK")),
      ),
      href: "/app/settings/facebook",
    },
    {
      name: "Instagram",
      connected: installations.some(
        (i) =>
          i.status === "ACTIVE" &&
          (i.channel.toUpperCase().includes("INSTAGRAM") ||
            i.provider.toUpperCase().includes("INSTAGRAM")),
      ),
      href: "/app/settings/instagram",
    },
    {
      name: "Web Chat",
      connected: webChat.some((w) => w.status === "ACTIVE"),
      href: "/app/settings/web-chat",
    },
  ];

  return (
    <Container className="py-8 lg:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cv-fg-muted)]">
        My CONVORA
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {primary.organizationName}
      </h1>
      <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
        Your public presence and connected channels.
      </p>

      <section className="mt-8 rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]">
        <h2 className="text-sm font-semibold">Public link</h2>
        <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
          Share this page so customers can discover you. Messaging via connected
          channels does not require visiting this link.
        </p>
        <div className="mt-4">
          <ShareLinkBar url={publicUrl} title={primary.organizationName} />
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link
            href={`/org/${primary.organizationSlug}`}
            className="font-medium text-[var(--cv-accent)] hover:underline"
            target="_blank"
          >
            Preview →
          </Link>
          <Link
            href="/app/organization/profile"
            className="font-medium text-[var(--cv-fg-secondary)] hover:underline"
          >
            Edit profile
          </Link>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]">
        <h2 className="text-sm font-semibold">Connected channels</h2>
        <ul className="mt-4 space-y-3">
          {channels.map((c) => (
            <li
              key={c.name}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="font-medium text-[var(--cv-fg)]">{c.name}</span>
              <div className="flex items-center gap-3">
                <Badge tone={c.connected ? "success" : "neutral"}>
                  {c.connected ? "Connected" : "Not connected"}
                </Badge>
                <Link
                  href={c.href}
                  className="text-[var(--cv-accent)] hover:underline"
                >
                  {c.connected ? "Manage" : "Connect"}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Container>
  );
}
