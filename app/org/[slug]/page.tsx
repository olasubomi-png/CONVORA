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

function absolutizeMediaUrl(
  appUrl: string,
  pathOrUrl: string | null | undefined,
): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  const base = appUrl.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

function firstName(displayName: string): string {
  const part = displayName.trim().split(/\s+/)[0];
  return part || displayName;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getPublicOrganizationProfileBySlug(slug);
  if (!profile) return { title: "Organization — CONVORA" };
  const env = getServerEnv();
  const url = `${env.APP_URL.replace(/\/$/, "")}/org/${profile.slug}`;
  const description =
    profile.description?.trim() ||
    `${profile.displayName} on CONVORA — message them where you already are.`;
  const imageUrl = absolutizeMediaUrl(env.APP_URL, profile.logoUrl);

  return {
    title: `${profile.displayName} — CONVORA`,
    description,
    openGraph: {
      title: `${profile.displayName} — CONVORA`,
      description,
      url,
      type: "profile",
      ...(imageUrl
        ? {
            images: [
              {
                url: imageUrl,
                width: 1200,
                height: 630,
                alt: `${profile.displayName} profile photo`,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: `${profile.displayName} — CONVORA`,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
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
  const messageLabel = `Message ${firstName(profile.displayName)}`;
  const aboutText =
    profile.description?.trim() ||
    `Connect with ${profile.displayName} on CONVORA.`;

  // ——— Conversation-first (?chat=1) ———
  if (chatPrimary && chatAvailable) {
    return (
      <div className="min-h-screen bg-[var(--cv-bg)]">
        <header className="border-b border-[var(--cv-border)] bg-white">
          <Container className="flex h-14 items-center justify-between">
            <Link
              href={`/org/${profile.slug}`}
              className="text-sm font-medium text-[var(--cv-fg-muted)] hover:text-[var(--cv-fg)]"
            >
              ← Profile
            </Link>
            <Link
              href={`/org/${profile.slug}#about`}
              className="text-sm text-[var(--cv-fg-muted)] hover:text-[var(--cv-fg)]"
            >
              About
            </Link>
          </Container>
        </header>
        <main className="py-0 sm:py-6">
          <Container className="max-w-xl px-0 sm:px-4">
            <PublicWebChatWidget
              publicKey={webChat!.publicKey}
              displayName={webChat!.displayName || profile.displayName}
              welcomeMessage={webChat!.welcomeMessage}
              avatarUrl={profile.logoUrl}
              profileHref={`/org/${profile.slug}#about`}
              verified={profile.verificationStatus === "VERIFIED"}
              autoOpen
              variant="full"
            />
          </Container>
        </main>
      </div>
    );
  }

  // ——— Profile-first (default) ———
  return (
    <div className="min-h-screen bg-[var(--cv-bg)] pb-8">
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
          {chatAvailable ? (
            <Link
              href={`/org/${profile.slug}?chat=1`}
              className="rounded-lg bg-[var(--cv-accent)] px-3.5 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Message
            </Link>
          ) : (
            <span className="text-xs text-[var(--cv-fg-muted)]">Public profile</span>
          )}
        </Container>
      </header>

      <main>
        {/* Hero profile */}
        <section className="border-b border-[var(--cv-border)] bg-white">
          <Container className="max-w-lg py-8 sm:py-10">
            <div className="flex flex-col items-center text-center">
              <div className="h-28 w-28 overflow-hidden rounded-full border-[3px] border-white bg-[var(--cv-accent-soft,#e8f2ed)] shadow-[0_2px_12px_rgba(15,23,42,0.08)] ring-1 ring-[var(--cv-border)] sm:h-32 sm:w-32">
                {profile.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.logoUrl}
                    alt={`${profile.displayName} profile photo`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-[var(--cv-accent)]">
                    {initials(profile.displayName)}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight text-[var(--cv-fg)]">
                  {profile.displayName}
                </h1>
                <VerificationBadge
                  status={profile.verificationStatus}
                  size={18}
                />
              </div>

              <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--cv-fg-secondary)]">
                {aboutText}
              </p>

              {chatAvailable ? (
                <Link
                  href={`/org/${profile.slug}?chat=1`}
                  className="mt-6 flex min-h-12 w-full max-w-sm items-center justify-center rounded-xl bg-[var(--cv-accent)] px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                >
                  {messageLabel}
                </Link>
              ) : (
                <p className="mt-6 text-sm text-[var(--cv-fg-muted)]">
                  Messaging is not available for this profile yet.
                </p>
              )}

              <a
                href="#about"
                className="mt-3 text-sm font-medium text-[var(--cv-accent)] hover:underline"
              >
                View profile
              </a>
            </div>
          </Container>
        </section>

        {/* About */}
        <section id="about" className="scroll-mt-16 bg-[var(--cv-bg)] py-8">
          <Container className="max-w-lg">
            <div className="rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6">
              <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--cv-fg-muted)]">
                About
              </h2>

              <div className="mt-4 flex items-start gap-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-[var(--cv-accent-soft,#e8f2ed)] ring-1 ring-[var(--cv-border)]">
                  {profile.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.logoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-[var(--cv-accent)]">
                      {initials(profile.displayName)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="text-base font-semibold text-[var(--cv-fg)]">
                      {profile.displayName}
                    </h3>
                    <VerificationBadge status={profile.verificationStatus} />
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-[var(--cv-fg-secondary)]">
                    {aboutText}
                  </p>
                </div>
              </div>

              {hasContact ? (
                <dl className="mt-5 space-y-2 border-t border-[var(--cv-border)] pt-4 text-sm">
                  {profile.publicEmail ? (
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                      <dt className="shrink-0 text-[var(--cv-fg-muted)]">Email</dt>
                      <dd>
                        <a
                          className="text-[var(--cv-accent)] hover:underline"
                          href={`mailto:${profile.publicEmail}`}
                        >
                          {profile.publicEmail}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {profile.publicPhone ? (
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                      <dt className="shrink-0 text-[var(--cv-fg-muted)]">Phone</dt>
                      <dd className="text-[var(--cv-fg)]">{profile.publicPhone}</dd>
                    </div>
                  ) : null}
                  {profile.websiteUrl ? (
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                      <dt className="shrink-0 text-[var(--cv-fg-muted)]">Website</dt>
                      <dd>
                        <a
                          className="break-all text-[var(--cv-accent)] hover:underline"
                          href={profile.websiteUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          {profile.websiteUrl}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {chatAvailable ? (
                <Link
                  href={`/org/${profile.slug}?chat=1`}
                  className="mt-5 flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--cv-border)] text-sm font-medium text-[var(--cv-fg)] hover:bg-[#f8f8f7]"
                >
                  {messageLabel}
                </Link>
              ) : null}
            </div>
          </Container>
        </section>
      </main>
    </div>
  );
}
