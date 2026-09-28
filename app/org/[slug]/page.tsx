import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicOrganizationProfileBySlug } from "@/lib/profiles/public";
import { getPublicWebChatEmbedByOrgSlug } from "@/lib/web-chat/public-embed";
import { Container } from "@/components/ui/container";
import { VerificationBadge } from "@/components/profiles/verification-badge";
import { PublicWebChatWidget } from "@/components/web-chat/public-widget";
import { getServerEnv } from "@/lib/env";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ chat?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicOrganizationProfileBySlug(slug);
  if (!profile) return { title: "Organization — CONVORA" };
  const env = getServerEnv();
  const url = `${env.APP_URL}/org/${profile.slug}`;
  const description =
    profile.description ??
    `${profile.displayName} on CONVORA — message them where you already are.`;
  return {
    title: `${profile.displayName} — CONVORA`,
    description,
    openGraph: {
      title: profile.displayName,
      description,
      url,
      type: "profile",
      ...(profile.logoUrl ? { images: [{ url: profile.logoUrl }] } : {}),
    },
    twitter: {
      card: "summary",
      title: profile.displayName,
      description,
    },
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function PublicOrgPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const chatPrimary = sp.chat === "1" || sp.chat === "true";

  const [profile, webChat] = await Promise.all([
    getPublicOrganizationProfileBySlug(slug),
    getPublicWebChatEmbedByOrgSlug(slug),
  ]);
  if (!profile) notFound();

  const hasContact =
    Boolean(profile.publicEmail) ||
    Boolean(profile.publicPhone) ||
    Boolean(profile.websiteUrl);

  const chatAvailable = Boolean(webChat?.publicKey);

  return (
    <div className="min-h-screen bg-[var(--cv-bg)]">
      <header className="border-b border-[var(--cv-border)] bg-white">
        <Container className="flex h-14 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-semibold tracking-[0.14em]"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--cv-accent)] text-xs font-bold text-white">
              C
            </span>
            CONVORA
          </Link>
          {chatPrimary && chatAvailable ? (
            <Link
              href={`/org/${profile.slug}`}
              className="text-sm text-[var(--cv-fg-muted)] hover:text-[var(--cv-fg)]"
            >
              About
            </Link>
          ) : chatAvailable ? (
            <Link
              href={`/org/${profile.slug}?chat=1`}
              className="rounded-lg bg-[var(--cv-accent)] px-3 py-1.5 text-sm font-medium text-white"
            >
              Message
            </Link>
          ) : (
            <span className="text-xs text-[var(--cv-fg-muted)]">Public profile</span>
          )}
        </Container>
      </header>

      <main>
        {chatAvailable && (chatPrimary || true) ? (
          <section className="border-b border-[var(--cv-border)] bg-[var(--cv-bg)] py-4 sm:py-8">
            <Container className="max-w-xl">
              {!chatPrimary ? (
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-[var(--cv-accent-soft,#e8f2ed)] text-sm font-semibold text-[var(--cv-accent)]">
                    {profile.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.logoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      initials(profile.displayName)
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="truncate text-lg font-semibold tracking-tight">
                        {profile.displayName}
                      </h1>
                      <VerificationBadge status={profile.verificationStatus} />
                    </div>
                    <p className="text-xs text-[var(--cv-fg-muted)]">
                      Message the team directly — no account required
                    </p>
                  </div>
                </div>
              ) : null}
              <PublicWebChatWidget
                publicKey={webChat!.publicKey}
                displayName={webChat!.displayName || profile.displayName}
                welcomeMessage={webChat!.welcomeMessage}
                avatarUrl={profile.logoUrl}
                profileHref={`/org/${profile.slug}#about`}
                verified={profile.verificationStatus === "VERIFIED"}
                autoOpen={chatPrimary}
                variant={chatPrimary ? "full" : "full"}
              />
            </Container>
          </section>
        ) : null}

        <section
          id="about"
          className="border-b border-[var(--cv-border)] bg-white py-10"
        >
          <Container className="max-w-2xl">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--cv-fg-muted)]">
              About
            </h2>
            <div className="mt-4 flex items-start gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--cv-accent-soft,#e8f2ed)] text-lg font-semibold text-[var(--cv-accent)]">
                {profile.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.logoUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  initials(profile.displayName)
                )}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold tracking-tight">
                    {profile.displayName}
                  </h3>
                  <VerificationBadge status={profile.verificationStatus} />
                </div>
                {profile.description ? (
                  <p className="mt-2 text-sm leading-6 text-[var(--cv-fg-secondary)]">
                    {profile.description}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--cv-fg-muted)]">
                    This organization is on CONVORA.
                  </p>
                )}
              </div>
            </div>

            {hasContact ? (
              <div className="mt-6 space-y-1 text-sm text-[var(--cv-fg-secondary)]">
                {profile.publicEmail ? (
                  <p>
                    Email:{" "}
                    <a
                      className="text-[var(--cv-accent)] hover:underline"
                      href={`mailto:${profile.publicEmail}`}
                    >
                      {profile.publicEmail}
                    </a>
                  </p>
                ) : null}
                {profile.publicPhone ? <p>Phone: {profile.publicPhone}</p> : null}
                {profile.websiteUrl ? (
                  <p>
                    Website:{" "}
                    <a
                      className="text-[var(--cv-accent)] hover:underline"
                      href={profile.websiteUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {profile.websiteUrl}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}

            {chatAvailable ? (
              <p className="mt-6">
                <Link
                  href={`/org/${profile.slug}?chat=1`}
                  className="text-sm font-medium text-[var(--cv-accent)] hover:underline"
                >
                  Open conversation →
                </Link>
              </p>
            ) : null}
          </Container>
        </section>
      </main>
    </div>
  );
}
