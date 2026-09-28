"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  createPostAction,
  publishPostAction,
  archivePostAction,
  type ProfileActionResult,
} from "@/app/actions/profiles";
import { AgentProfileForm } from "@/components/profiles/agent-profile-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PostRow = {
  id: string;
  body: string;
  type: string;
  mediaUrl: string | null;
  visibility: "DRAFT" | "PUBLIC" | "ARCHIVED";
  publishedAt: string | null;
  createdAt: string;
};

type Props = {
  organizationId: string;
  organizationName: string;
  profileId: string | null;
  publicUsername: string | null;
  visibility: "PUBLIC" | "PRIVATE" | null;
  displayName: string;
  professionalTitle: string | null;
  bio?: string | null;
  avatarUrl: string | null;
  profileDefaults: {
    publicUsername?: string;
    displayName?: string;
    professionalTitle?: string | null;
    bio?: string | null;
    location?: string | null;
    serviceArea?: string | null;
    yearsExperience?: number | null;
    visibility?: "PUBLIC" | "PRIVATE";
  };
  saveProfileAction: (formData: FormData) => Promise<ProfileActionResult>;
  initialPosts: PostRow[];
};

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function formatWhen(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function AgentProfileWorkspace({
  organizationId,
  organizationName,
  profileId,
  publicUsername,
  visibility,
  displayName,
  professionalTitle,
  bio,
  avatarUrl: initialAvatar,
  profileDefaults,
  saveProfileAction,
  initialPosts,
}: Props) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [editOpen, setEditOpen] = useState(!profileId);

  const [composer, setComposer] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [posts, setPosts] = useState(initialPosts);
  const [pending, startTransition] = useTransition();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    setAvatarUrl(initialAvatar);
  }, [initialAvatar]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function uploadAvatar(file: File) {
    if (!profileId) {
      setAvatarError("Save your profile first, then add a photo.");
      setEditOpen(true);
      return;
    }
    setAvatarBusy(true);
    setAvatarError(null);
    setAvatarMenuOpen(false);
    const localPreview = URL.createObjectURL(file);
    setAvatarUrl(localPreview);
    try {
      const fd = new FormData();
      fd.set("profileId", profileId);
      fd.set("avatar", file);
      const res = await fetch("/api/profiles/avatar", { method: "POST", body: fd });
      const data = (await res.json()) as {
        avatarUrl?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        setAvatarUrl(initialAvatar);
        setAvatarError(
          data.error?.message ??
            "Could not update photo. Check storage configuration.",
        );
        return;
      }
      setAvatarUrl(data.avatarUrl ?? localPreview);
    } catch {
      setAvatarUrl(initialAvatar);
      setAvatarError("Could not update photo. Please try again.");
    } finally {
      setAvatarBusy(false);
      URL.revokeObjectURL(localPreview);
    }
  }

  async function removeAvatar() {
    if (!profileId) return;
    setAvatarBusy(true);
    setAvatarError(null);
    setAvatarMenuOpen(false);
    try {
      const res = await fetch(
        `/api/profiles/avatar?profileId=${encodeURIComponent(profileId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: { message?: string } };
        setAvatarError(data.error?.message ?? "Could not remove photo.");
        return;
      }
      setAvatarUrl(null);
    } catch {
      setAvatarError("Could not remove photo.");
    } finally {
      setAvatarBusy(false);
    }
  }

  function clearPendingImage() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingImage(null);
    setPendingPreview(null);
  }

  async function publish() {
    if (!profileId) {
      setPostError("Save your profile before posting.");
      setEditOpen(true);
      return;
    }
    if (!composer.trim() && !pendingImage) return;
    setPostError(null);
    startTransition(async () => {
      try {
        let mediaUrl: string | undefined;
        if (pendingImage) {
          const fd = new FormData();
          fd.set("profileId", profileId);
          fd.set("image", pendingImage);
          const up = await fetch("/api/profiles/post-media", {
            method: "POST",
            body: fd,
          });
          const upData = (await up.json()) as {
            mediaUrl?: string;
            error?: { message?: string };
          };
          if (!up.ok) {
            setPostError(
              upData.error?.message ??
                "Could not upload photo. Check storage configuration.",
            );
            return;
          }
          mediaUrl = upData.mediaUrl;
        }
        const bodyText = composer.trim();
        const fd = new FormData();
        fd.set("agentProfileId", profileId);
        fd.set("body", bodyText || " ");
        fd.set("type", mediaUrl ? "IMAGE" : "TEXT");
        if (mediaUrl) fd.set("mediaUrl", mediaUrl);
        fd.set("visibility", "PUBLIC");
        const result = await createPostAction(fd);
        if (!result.ok) {
          setPostError(result.error);
          return;
        }
        setComposer("");
        clearPendingImage();
        window.location.reload();
      } catch {
        setPostError("Could not publish. Please try again.");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-16">
      {/* Profile header card */}
      <section className="overflow-hidden rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        {/* Cover */}
        <div className="relative h-36 bg-gradient-to-br from-[#1f4e3d] via-[#2a6350] to-[#3d7a64] sm:h-44">
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 80%, rgba(255,255,255,0.25), transparent 45%), radial-gradient(circle at 80% 20%, rgba(255,255,255,0.15), transparent 40%)",
            }}
          />
        </div>

        <div className="relative px-4 pb-5 sm:px-6">
          {/* Avatar overlapping cover */}
          <div className="relative -mt-14 mb-3 flex justify-start sm:-mt-16">
            <div className="relative" ref={menuRef}>
              <div
                className={cn(
                  "h-[112px] w-[112px] overflow-hidden rounded-full border-4 border-white bg-[#f3f3f1] shadow-md sm:h-[128px] sm:w-[128px]",
                  avatarBusy && "opacity-70",
                )}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-semibold text-[#5c5c5c]">
                    {displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              {/* Camera button — large touch target */}
              <button
                type="button"
                disabled={avatarBusy}
                aria-label="Change profile photo"
                onClick={() => {
                  if (!profileId) {
                    setAvatarError("Save your profile first, then add a photo.");
                    setEditOpen(true);
                    return;
                  }
                  setAvatarMenuOpen((o) => !o);
                }}
                className="absolute bottom-1 right-1 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-[var(--cv-fg,#141414)] text-white shadow-md transition hover:bg-[#2a2a2a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cv-accent,#1f4e3d)] disabled:opacity-60 sm:h-12 sm:w-12"
              >
                <CameraIcon className="h-5 w-5" />
              </button>

              {avatarMenuOpen ? (
                <div className="absolute left-0 top-full z-20 mt-2 w-48 overflow-hidden rounded-xl border border-[var(--cv-border,#e4e4e2)] bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    className="flex w-full px-4 py-3 text-left text-sm hover:bg-[#f8f8f7]"
                    onClick={() => fileRef.current?.click()}
                  >
                    Upload photo
                  </button>
                  {avatarUrl ? (
                    <button
                      type="button"
                      className="flex w-full px-4 py-3 text-left text-sm text-red-700 hover:bg-red-50"
                      onClick={() => void removeAvatar()}
                    >
                      Remove photo
                    </button>
                  ) : null}
                </div>
              ) : null}

              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                capture="user"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadAvatar(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          {avatarError ? (
            <p className="mb-3 text-sm text-red-700" role="alert">
              {avatarError}
            </p>
          ) : null}
          {avatarBusy ? (
            <p className="mb-2 text-xs text-[var(--cv-fg-muted,#5c5c5c)]">
              Updating photo…
            </p>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-[var(--cv-fg,#141414)]">
                {displayName}
              </h1>
              {publicUsername ? (
                <p className="mt-0.5 text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
                  @{publicUsername}
                </p>
              ) : null}
              {professionalTitle ? (
                <p className="mt-1 text-sm text-[var(--cv-fg-secondary,#3f3f3f)]">
                  {professionalTitle}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
                {organizationName}
                {visibility === "PUBLIC" ? " · Public" : " · Private"}
              </p>
              {bio ? (
                <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--cv-fg-secondary,#3f3f3f)]">
                  {bio}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditOpen(true)}
              >
                Edit profile
              </Button>
              {visibility === "PUBLIC" && publicUsername ? (
                <Link
                  href={`/agents/${publicUsername}`}
                  className="inline-flex items-center justify-center rounded-xl bg-[var(--cv-accent,#1f4e3d)] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-95"
                >
                  View public profile
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Edit profile modal */}
      {editOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Edit profile"
        >
          <div className="flex max-h-[min(100dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
            <header className="flex items-center justify-between border-b border-[var(--cv-border,#e4e4e2)] px-4 py-3">
              <h2 className="text-base font-semibold">Edit profile</h2>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-[var(--cv-fg-muted,#5c5c5c)] hover:bg-[#f3f3f1]"
                onClick={() => setEditOpen(false)}
                disabled={!profileId && !profileDefaults.publicUsername}
              >
                Cancel
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              {!profileId ? (
                <p className="mb-4 rounded-xl bg-[#f0f7f3] px-3 py-2 text-sm text-[var(--cv-accent,#1f4e3d)]">
                  Complete your profile to unlock photo uploads and posts.
                </p>
              ) : null}
              <AgentProfileForm
                organizationId={organizationId}
                action={saveProfileAction}
                defaults={profileDefaults}
                onSuccess={() => {
                  window.location.reload();
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Composer */}
      <section className="rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#f3f3f1]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm font-medium text-[#5c5c5c]">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <textarea
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              rows={3}
              placeholder="What's on your mind?"
              disabled={pending || !profileId}
              className="w-full resize-none rounded-xl border border-[var(--cv-border,#e4e4e2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--cv-accent,#1f4e3d)] focus:ring-2 focus:ring-[var(--cv-accent,#1f4e3d)]/20 disabled:bg-[#fafafa]"
            />
            {pendingPreview ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={pendingPreview}
                  alt="Selected"
                  className="max-h-48 rounded-xl object-cover"
                />
                <button
                  type="button"
                  onClick={clearPendingImage}
                  className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white"
                >
                  Remove
                </button>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--cv-border,#e4e4e2)] px-3 py-2 text-sm font-medium hover:bg-[#f8f8f7]",
                  !profileId && "pointer-events-none opacity-50",
                )}
              >
                <span aria-hidden>📷</span>
                Add photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={!profileId}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
                    setPendingImage(f);
                    setPendingPreview(f ? URL.createObjectURL(f) : null);
                  }}
                />
              </label>
              <Button
                type="button"
                disabled={pending || !profileId || (!composer.trim() && !pendingImage)}
                onClick={() => void publish()}
              >
                {pending ? "Publishing…" : "Publish"}
              </Button>
            </div>
            {!profileId ? (
              <p className="text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
                Save your profile to start posting.
              </p>
            ) : null}
            {postError ? (
              <p className="text-sm text-red-700" role="alert">
                {postError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* Feed */}
      <section className="space-y-3">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-[var(--cv-fg-muted,#5c5c5c)]">
          Posts
        </h2>
        {posts.filter((p) => p.visibility !== "ARCHIVED").length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--cv-border,#e4e4e2)] bg-white px-4 py-10 text-center text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
            No posts yet. Share an update above.
          </div>
        ) : (
          posts
            .filter((p) => p.visibility !== "ARCHIVED")
            .map((post) => (
              <article
                key={post.id}
                className="rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5"
              >
                <div className="flex gap-3">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#f3f3f1]">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm font-medium">
                        {displayName.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--cv-fg,#141414)]">
                          {displayName}
                        </p>
                        <p className="text-xs text-[var(--cv-fg-muted,#5c5c5c)]">
                          {formatWhen(post.publishedAt ?? post.createdAt)}
                          {post.visibility === "DRAFT" ? " · Draft" : ""}
                        </p>
                      </div>
                      {!post.id.startsWith("local-") ? (
                        <div className="relative">
                          <button
                            type="button"
                            aria-label="Post options"
                            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--cv-fg-muted,#5c5c5c)] hover:bg-[#f3f3f1]"
                            onClick={() =>
                              setOpenMenuId((id) =>
                                id === post.id ? null : post.id,
                              )
                            }
                          >
                            ···
                          </button>
                          {openMenuId === post.id ? (
                            <div className="absolute right-0 z-10 mt-1 w-36 overflow-hidden rounded-xl border border-[var(--cv-border,#e4e4e2)] bg-white py-1 shadow-lg">
                              {post.visibility === "DRAFT" ? (
                                <button
                                  type="button"
                                  className="block w-full px-3 py-2.5 text-left text-sm hover:bg-[#f8f8f7]"
                                  onClick={() => {
                                    const fd = new FormData();
                                    fd.set("postId", post.id);
                                    startTransition(async () => {
                                      await publishPostAction(fd);
                                      window.location.reload();
                                    });
                                  }}
                                >
                                  Publish
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="block w-full px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50"
                                onClick={() => {
                                  const fd = new FormData();
                                  fd.set("postId", post.id);
                                  startTransition(async () => {
                                    await archivePostAction(fd);
                                    setPosts((prev) =>
                                      prev.filter((p) => p.id !== post.id),
                                    );
                                    setOpenMenuId(null);
                                  });
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {post.body.trim() && post.body.trim() !== "[image]" ? (
                      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-[var(--cv-fg,#141414)]">
                        {post.body}
                      </p>
                    ) : null}
                    {post.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.mediaUrl}
                        alt=""
                        className="mt-3 max-h-[28rem] w-full rounded-xl object-cover"
                      />
                    ) : null}
                  </div>
                </div>
              </article>
            ))
        )}
      </section>
    </div>
  );
}
