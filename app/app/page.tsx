import Link from "next/link";
import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listOrganizationConversations } from "@/lib/conversations/list";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Dashboard — CONVORA" };

export default async function WorkspaceHomePage() {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];

  let openCount = 0;
  let totalCount = 0;
  if (primary) {
    const list = await listOrganizationConversations(
      auth.user.id,
      primary.organizationId,
    );
    totalCount = list.conversations.length;
    openCount = list.conversations.filter(
      (c) => c.status === "OPEN" || c.status === "PENDING",
    ).length;
  }

  return (
    <Container className="py-8 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cv-fg-muted)]">
            Dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--cv-fg)]">
            Welcome back, {auth.user.fullName.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
            {primary
              ? `${primary.organizationName} · ${primary.role}`
              : "Create an organization to get started"}
          </p>
        </div>
        <Link
          href="/app/inbox"
          className="inline-flex rounded-xl bg-[var(--cv-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
        >
          Open inbox
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Open conversations", value: String(openCount) },
          { label: "Total conversations", value: String(totalCount) },
          { label: "Organizations", value: String(memberships.length) },
          {
            label: "Role",
            value: primary?.role ?? "—",
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]"
          >
            <p className="text-xs font-medium text-[var(--cv-fg-muted)]">
              {card.label}
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--cv-fg)]">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold text-[var(--cv-fg)]">
          Your organizations
        </h2>
        {!memberships.length ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--cv-border)] bg-white p-8 text-center">
            <p className="text-sm text-[var(--cv-fg-secondary)]">
              You are not a member of any organization yet.
            </p>
            <Link
              href="/app/organization"
              className="mt-4 inline-flex rounded-xl bg-[var(--cv-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
            >
              Create organization
            </Link>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-[var(--cv-border)] overflow-hidden rounded-2xl border border-[var(--cv-border)] bg-white shadow-[var(--cv-shadow-sm)]">
            {memberships.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-4 px-4 py-3.5 text-sm"
              >
                <div>
                  <p className="font-medium text-[var(--cv-fg)]">
                    {m.organizationName}
                  </p>
                  <p className="text-[var(--cv-fg-muted)]">
                    {m.organizationSlug} · {m.role}
                  </p>
                </div>
                <Link
                  href={`/app/organization?org=${m.organizationId}`}
                  className="font-medium text-[var(--cv-accent)] hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          {
            href: "/app/customers",
            title: "Customers",
            body: "Profiles, tags, and history",
          },
          {
            href: "/app/settings/web-chat",
            title: "Channels",
            body: "Web Chat, WhatsApp, Meta",
          },
          {
            href: "/app/settings/billing",
            title: "Billing",
            body: "Trial, plans, and payments",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)] transition-colors hover:border-[var(--cv-accent)]"
          >
            <p className="font-semibold text-[var(--cv-fg)]">{item.title}</p>
            <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">{item.body}</p>
          </Link>
        ))}
      </section>
    </Container>
  );
}
