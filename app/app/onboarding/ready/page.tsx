import Link from "next/link";
import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { getServerEnv } from "@/lib/env";
import { ShareLinkBar } from "@/components/share/share-link";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Your CONVORA is ready — CONVORA" };

export default async function OnboardingReadyPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>;
}) {
  const auth = await requireAuthenticatedUser();
  const orgs = await getUserOrganizationContexts(auth.user.id);
  if (!orgs[0]) redirect("/app/onboarding");

  const params = await searchParams;
  const slug = (params.slug ?? orgs[0].organizationSlug).trim().toLowerCase();
  const env = getServerEnv();
  const publicUrl = `${env.APP_URL}/org/${slug}`;

  return (
    <Container className="max-w-lg py-10 lg:py-16">
      <p className="text-sm font-medium text-[var(--cv-success)]">
        Your CONVORA is ready
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--cv-fg)]">
        {orgs[0].organizationName}
      </h1>
      <p className="mt-2 text-sm text-[var(--cv-fg-muted)]">
        Your customers can find your business here. They do not need to join
        CONVORA—share this link, or connect WhatsApp, Facebook, and Instagram so
        they can message you where they already are.
      </p>

      <div className="mt-8 rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cv-fg-muted)]">
          Your public page
        </p>
        <div className="mt-3">
          <ShareLinkBar url={publicUrl} title={orgs[0].organizationName} />
        </div>
        <Link
          href={`/org/${slug}`}
          target="_blank"
          className="mt-4 inline-block text-sm font-medium text-[var(--cv-accent)] hover:underline"
        >
          Preview page →
        </Link>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-surface-muted)] p-5">
        <p className="text-sm font-semibold text-[var(--cv-fg)]">
          Optional: connect channels
        </p>
        <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
          When customers message your WhatsApp, Facebook, or Instagram, those
          conversations appear in your CONVORA inbox. You reply once—they stay
          on their platform.
        </p>
        <Link
          href="/app/channels"
          className="mt-4 inline-flex rounded-xl bg-[var(--cv-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
        >
          Connect a channel
        </Link>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/app"
          className="inline-flex rounded-xl border border-[var(--cv-border)] bg-white px-4 py-2.5 text-sm font-medium hover:bg-[var(--cv-surface-muted)]"
        >
          Go to dashboard
        </Link>
        <Link
          href="/app/inbox"
          className="inline-flex rounded-xl bg-[var(--cv-fg)] px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          Open inbox
        </Link>
      </div>
    </Container>
  );
}
