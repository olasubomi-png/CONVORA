import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicAgentProfileByUsername } from "@/lib/profiles/public";
import { getPublicWebChatEmbedByOrgSlug } from "@/lib/web-chat/public-embed";
import { Container } from "@/components/ui/container";
import { VerificationBadge } from "@/components/profiles/verification-badge";
import { PublicAgentPosts } from "@/components/profiles/public-agent-posts";
import { PublicChatCta } from "@/components/profiles/public-chat-cta";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await getPublicAgentProfileByUsername(username);
  if (!profile) {
    return { title: "Profile — CONVORA" };
  }

  const title = `${profile.displayName}${
    profile.professionalTitle ? ` · ${profile.professionalTitle}` : ""
  } — CONVORA`;
  const description =
    profile.bio?.slice(0, 160) ||
    `${profile.displayName} on CONVORA — connect and start a conversation.`;
  const appUrl = (process.env.APP_URL ?? "https://convora-fawn.vercel.app").replace(
    /\/$/,
    "",
  );
  const canonical = `${appUrl}/agents/${profile.username}`;
  const image =
    profile.avatarUrl && profile.avatarUrl.startsWith("http")
      ? profile.avatarUrl
      : profile.avatarUrl
        ? `${appUrl}${profile.avatarUrl}`
        : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "profile",
      siteName: "CONVORA",
      images: image ? [{ url: image, alt: profile.displayName }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicAgentPage({ params }: Props) {
  const { username } = await params;
  const profile = await getPublicAgentProfileByUsername(username);
  if (!profile) notFound();

  const embed = await getPublicWebChatEmbedByOrgSlug(profile.organization.slug);

  return (
    <div className="min-h-screen bg-[var(--cv-bg,#f8f8f7)]">
      <header className="border-b border-[var(--cv-border,#e4e4e2)] bg-white">
        <Container className="flex h-14 items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold tracking-[0.18em] text-[var(--cv-fg,#141414)]"
          >
            CONVORA
          </Link>
          <Link
            href={`/org/${profile.organization.slug}`}
            className="text-sm text-[var(--cv-fg-secondary,#3f3f3f)] hover:text-[var(--cv-fg,#141414)]"
          >
            {profile.organization.displayName}
          </Link>
        </Container>
      </header>

      <main>
        <section className="border-b border-[var(--cv-border,#e4e4e2)] bg-white">
          <Container className="grid gap-8 py-10 md:grid-cols-12 md:py-14">
            <div className="md:col-span-8">
              <div className="flex items-start gap-5">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatarUrl}
                    alt={profile.displayName}
                    className="h-20 w-20 shrink-0 rounded-2xl border border-[var(--cv-border,#e4e4e2)] object-cover"
                    width={80}
                    height={80}
                  />
                ) : (
                  <div
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-[#f3f3f1] text-2xl font-medium text-[#5c5c5c]"
                    aria-hidden
                  >
                    {profile.displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl tracking-tight text-[var(--cv-fg,#141414)]">
                      {profile.displayName}
                    </h1>
                    <VerificationBadge status={profile.verificationStatus} />
                  </div>
                  {profile.professionalTitle ? (
                    <p className="mt-1 text-[var(--cv-fg-secondary,#3f3f3f)]">
                      {profile.professionalTitle}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
                    @{profile.username}
                    {profile.location ? ` · ${profile.location}` : ""}
                    {profile.serviceArea ? ` · ${profile.serviceArea}` : ""}
                  </p>
                </div>
              </div>
              {profile.bio ? (
                <p className="mt-6 max-w-2xl text-[15px] leading-7 text-[var(--cv-fg-secondary,#3f3f3f)]">
                  {profile.bio}
                </p>
              ) : null}
            </div>
            <div className="md:col-span-4">
              <PublicChatCta
                organizationSlug={profile.organization.slug}
                agentName={profile.displayName}
                embed={embed}
              />
            </div>
          </Container>
        </section>

        <section>
          <Container className="py-10">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--cv-fg,#141414)]">
              Activity
            </h2>
            <PublicAgentPosts posts={profile.posts} />
          </Container>
        </section>
      </main>
    </div>
  );
}
