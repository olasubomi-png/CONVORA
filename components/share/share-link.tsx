"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareLinkBar({
  url,
  title,
}: {
  url: string;
  title: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url, text: title });
        return;
      } catch {
        /* cancelled */
      }
    }
    await copy();
  }

  const wa = `https://wa.me/?text=${encodeURIComponent(`${title}\n${url}`)}`;
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-surface-muted)] px-3 py-2.5 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 truncate text-sm text-[var(--cv-fg)]">
          {url}
        </code>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button type="button" size="sm" onClick={() => void share()}>
            Share
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-[var(--cv-border)] bg-white px-3 py-1.5 hover:bg-[var(--cv-surface-muted)]"
        >
          Share on WhatsApp
        </a>
        <a
          href={fb}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-[var(--cv-border)] bg-white px-3 py-1.5 hover:bg-[var(--cv-surface-muted)]"
        >
          Share on Facebook
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded-lg border border-[var(--cv-border)] bg-white px-3 py-1.5 hover:bg-[var(--cv-surface-muted)]"
        >
          Instagram (copy for bio)
        </button>
      </div>
      <p className="text-xs text-[var(--cv-fg-muted)]">
        Instagram does not support direct link sharing from apps. Copy your
        CONVORA link into your bio, story, or DMs.
      </p>
    </div>
  );
}
