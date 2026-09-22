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

export const metadata = { title: "Channels — CONVORA" };

const CHANNEL_CARDS = [
  {
    key: "WHATSAPP",
    title: "WhatsApp",
    body: "Customers message your WhatsApp as usual. Conversations appear in CONVORA.",
    href: "/app/settings/whatsapp",
    match: (ch: string, provider: string) =>
      ch.includes("WHATSAPP") || provider.includes("whatsapp"),
  },
  {
    key: "FACEBOOK",
    title: "Facebook Messenger",
    body: "Receive Messenger conversations in your shared inbox.",
    href: "/app/settings/facebook",
    match: (ch: string, provider: string) =>
      ch.includes("FACEBOOK") ||
      ch.includes("MESSENGER") ||
      provider.includes("facebook"),
  },
  {
    key: "INSTAGRAM",
    title: "Instagram",
    body: "Bring Instagram messaging into CONVORA when connected.",
    href: "/app/settings/instagram",
    match: (ch: string, provider: string) =>
      ch.includes("INSTAGRAM") || provider.includes("instagram"),
  },
  {
    key: "WEB_CHAT",
    title: "Web Chat",
    body: "Add CONVORA chat to your website so visitors can reach you instantly.",
    href: "/app/settings/web-chat",
    match: () => false,
  },
] as const;

export default async function ChannelsPage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];
  if (!primary) redirect("/app/onboarding");

  const [installations, webChat] = await Promise.all([
    listChannelInstallations(auth.user.id, primary.organizationId),
    listWebChat(auth.user.id, primary.organizationId),
  ]);

  function statusFor(card: (typeof CHANNEL_CARDS)[number]): {
    connected: boolean;
    label: string;
  } {
    if (card.key === "WEB_CHAT") {
      const active = webChat.some((w) => w.status === "ACTIVE");
      return {
        connected: active,
        label: active ? "Connected" : "Not connected",
      };
    }
    const hit = installations.find(
      (i) =>
        i.status === "ACTIVE" &&
        card.match(i.channel.toUpperCase(), i.provider.toUpperCase()),
    );
    return {
      connected: Boolean(hit),
      label: hit ? "Connected" : "Not connected",
    };
  }

  return (
    <Container className="py-8 lg:py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cv-fg-muted)]">
        Channels
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        Connect your customers
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--cv-fg-muted)]">
        Let people message you where they already spend time. Their
        conversations land in your CONVORA inbox—they never need a CONVORA
        account.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {CHANNEL_CARDS.map((card) => {
          const st = statusFor(card);
          return (
            <article
              key={card.key}
              className="flex flex-col rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold text-[var(--cv-fg)]">
                  {card.title}
                </h2>
                <Badge tone={st.connected ? "success" : "neutral"}>
                  {st.label}
                </Badge>
              </div>
              <p className="mt-2 flex-1 text-sm leading-6 text-[var(--cv-fg-secondary)]">
                {card.body}
              </p>
              <Link
                href={card.href}
                className="mt-4 inline-flex rounded-xl bg-[var(--cv-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
              >
                {st.connected ? "Manage" : `Connect ${card.title.split(" ")[0]}`}
              </Link>
            </article>
          );
        })}
      </div>
    </Container>
  );
}
