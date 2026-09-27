"use client";

import Link from "next/link";
import type { PublicWebChatEmbed } from "@/lib/web-chat/public-embed";

export function PublicChatCta({
  organizationSlug,
  agentName,
  embed,
}: {
  organizationSlug: string;
  agentName: string;
  embed: PublicWebChatEmbed | null;
}) {
  if (!embed) {
    return (
      <div className="rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-[#fafaf9] p-5 text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
        Messaging is not available for this profile yet.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-white p-5 shadow-[var(--cv-shadow-sm,0_1px_2px_rgba(0,0,0,0.04))]">
      <h2 className="font-semibold text-[var(--cv-fg,#141414)]">
        Message {agentName}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--cv-fg-secondary,#3f3f3f)]">
        Start a conversation on CONVORA Web Chat. No account required for you as
        a customer.
      </p>
      <Link
        href={`/org/${organizationSlug}?chat=1`}
        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-[var(--cv-accent,#1f4e3d)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-95"
      >
        Start a conversation
      </Link>
    </div>
  );
}
