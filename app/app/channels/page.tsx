import Link from "next/link";
import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listChannelInstallations } from "@/lib/channels/installations";
import { listInstallations as listWebChat } from "@/lib/web-chat/installations";
import { Container } from "@/components/ui/container";
import { Badge } from "@/components/ui/badge";
import { isMetaPlatformConfigured } from "@/lib/channels/meta/platform-config";

export const metadata = { title: "Channels — CONVORA" };

type ChannelStatus = {
  key: string;
  title: string;
  description: string;
  href: string;
  statusLabel: string;
  tone: "success" | "neutral" | "warning";
  actionLabel: string;
};

export default async function ChannelsPage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];
  if (!primary) redirect("/app/onboarding");

  const [installations, webChat] = await Promise.all([
    listChannelInstallations(auth.user.id, primary.organizationId),
    listWebChat(auth.user.id, primary.organizationId),
  ]);

  const anyActiveWeb = webChat.some((w) => w.status === "ACTIVE");

  const metaReady = isMetaPlatformConfigured();

  function metaStatus(
    match: (ch: string, provider: string) => boolean,
  ): { label: string; tone: "success" | "neutral" | "warning" } {
    const hit = installations.find(
      (i) =>
        i.status === "ACTIVE" &&
        match(i.channel.toUpperCase(), i.provider.toUpperCase()),
    );
    if (hit) return { label: "Connected", tone: "success" };
    if (!metaReady) return { label: "Not configured", tone: "warning" };
    const pending = installations.find(
      (i) =>
        i.status !== "ACTIVE" &&
        match(i.channel.toUpperCase(), i.provider.toUpperCase()),
    );
    if (pending) return { label: "Needs action", tone: "warning" };
    return { label: "Not connected", tone: "neutral" };
  }

  const wa = metaStatus(
    (ch, provider) => ch.includes("WHATSAPP") || provider.includes("WHATSAPP"),
  );
  const fb = metaStatus(
    (ch, provider) =>
      ch.includes("FACEBOOK") ||
      ch.includes("MESSENGER") ||
      provider.includes("FACEBOOK"),
  );
  const ig = metaStatus(
    (ch, provider) =>
      ch.includes("INSTAGRAM") || provider.includes("INSTAGRAM"),
  );

  const cards: ChannelStatus[] = [
    {
      key: "WEB_CHAT",
      title: "Web Chat",
      description:
        "Built into your CONVORA profile. Customers can message you from your public page without creating an account.",
      href: "/app/settings/web-chat",
      statusLabel: anyActiveWeb ? "Ready" : "Provisioning",
      tone: anyActiveWeb ? "success" : "warning",
      actionLabel: anyActiveWeb ? "View details" : "Retry setup",
    },
    {
      key: "WHATSAPP",
      title: "WhatsApp",
      description:
        "Authorize your WhatsApp Business account. CONVORA manages webhooks and delivery—you never paste API keys.",
      href: "/app/settings/whatsapp",
      statusLabel: wa.label,
      tone: wa.tone,
      actionLabel: wa.label === "Connected" ? "Manage" : "Connect WhatsApp",
    },
    {
      key: "FACEBOOK",
      title: "Facebook Messenger",
      description:
        "Authorize a Facebook Page. Messenger conversations appear in your shared inbox.",
      href: "/app/settings/facebook",
      statusLabel: fb.label,
      tone: fb.tone,
      actionLabel:
        fb.label === "Connected" ? "Manage" : "Connect Messenger",
    },
    {
      key: "INSTAGRAM",
      title: "Instagram",
      description:
        "Authorize an eligible Instagram professional account. Direct messages land in CONVORA.",
      href: "/app/settings/instagram",
      statusLabel: ig.label,
      tone: ig.tone,
      actionLabel: ig.label === "Connected" ? "Manage" : "Connect Instagram",
    },
  ];

  return (
    <Container className="py-8 lg:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cv-fg-muted)]">
        Communication channels
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        How customers reach you
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--cv-fg-muted)]">
        Web Chat is included with every CONVORA. Connect WhatsApp, Messenger, or
        Instagram when you are ready—authorization only, no technical setup.
        Every conversation lands in one inbox.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <article
            key={card.key}
            className="flex flex-col rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-[var(--cv-fg)]">
                {card.title}
              </h2>
              <Badge tone={card.tone}>{card.statusLabel}</Badge>
            </div>
            <p className="mt-2 flex-1 text-sm leading-6 text-[var(--cv-fg-secondary)]">
              {card.description}
            </p>
            <Link
              href={card.href}
              className="mt-4 inline-flex rounded-xl bg-[var(--cv-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
            >
              {card.actionLabel}
            </Link>
          </article>
        ))}
      </div>
    </Container>
  );
}
