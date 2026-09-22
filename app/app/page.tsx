import Link from "next/link";
import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listOrganizationConversations } from "@/lib/conversations/list";
import { listChannelInstallations } from "@/lib/channels/installations";
import { listInstallations as listWebChat } from "@/lib/web-chat/installations";
import { getServerEnv } from "@/lib/env";
import { ShareLinkBar } from "@/components/share/share-link";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Home — CONVORA" };

export default async function WorkspaceHomePage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  if (!primary) {
    redirect("/app/onboarding");
  }

  const env = getServerEnv();
  const publicUrl = `${env.APP_URL}/org/${primary.organizationSlug}`;

  const [list, installations, webChat] = await Promise.all([
    listOrganizationConversations(auth.user.id, primary.organizationId),
    listChannelInstallations(auth.user.id, primary.organizationId),
    listWebChat(auth.user.id, primary.organizationId),
  ]);

  const recent = list.conversations.slice(0, 5);
  const anyChannel =
    installations.some((i) => i.status === "ACTIVE") ||
    webChat.some((w) => w.status === "ACTIVE");
  const hasConversation = list.conversations.length > 0;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <Container className="py-8 lg:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--cv-fg)]">
        {greeting}, {auth.user.fullName.split(" ")[0]}
      </h1>
      <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
        Here is what you can do with CONVORA.
      </p>

      <section className="mt-8 rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]">
        <h2 className="text-sm font-semibold">Your CONVORA profile</h2>
        <p className="mt-1 text-sm text-[var(--cv-fg-secondary)]">
          {primary.organizationName}
        </p>
        <div className="mt-4">
          <ShareLinkBar url={publicUrl} title={primary.organizationName} />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]">
        <h2 className="text-sm font-semibold">Get connected</h2>
        <ul className="mt-4 space-y-2.5 text-sm">
          {[
            { done: true, label: "Create your profile" },
            { done: true, label: "Get your CONVORA link" },
            {
              done: anyChannel,
              label: "Connect a channel",
              href: "/app/channels",
            },
            {
              done: hasConversation,
              label: "Receive your first conversation",
              href: "/app/inbox",
            },
          ].map((item) => (
            <li key={item.label} className="flex items-center gap-2">
              <span
                className={
                  item.done
                    ? "text-[var(--cv-success)]"
                    : "text-[var(--cv-fg-subtle)]"
                }
              >
                {item.done ? "✓" : "○"}
              </span>
              {item.href && !item.done ? (
                <Link
                  href={item.href}
                  className="text-[var(--cv-accent)] hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-[var(--cv-fg-secondary)]">{item.label}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Recent conversations</h2>
          <Link
            href="/app/inbox"
            className="text-sm font-medium text-[var(--cv-accent)] hover:underline"
          >
            Open inbox
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-dashed border-[var(--cv-border)] bg-white p-6 text-center">
            <p className="text-sm font-medium text-[var(--cv-fg)]">
              Your inbox is quiet
            </p>
            <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
              Connect a channel and share your CONVORA to start receiving
              customer conversations.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href="/app/channels"
                className="rounded-xl bg-[var(--cv-accent)] px-4 py-2 text-sm font-medium text-white"
              >
                Connect a channel
              </Link>
              <Link
                href="/app/my-convora"
                className="rounded-xl border border-[var(--cv-border)] bg-white px-4 py-2 text-sm font-medium"
              >
                Share your CONVORA
              </Link>
            </div>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--cv-border)] overflow-hidden rounded-2xl border border-[var(--cv-border)] bg-white">
            {recent.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/inbox?conversation=${c.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-[var(--cv-surface-muted)]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--cv-fg)]">
                      {c.customer.displayName}
                    </p>
                    <p className="text-xs text-[var(--cv-fg-muted)]">
                      {c.channel} · {c.status}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--cv-fg-subtle)]">Open</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Container>
  );
}
