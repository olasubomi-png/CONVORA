"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  createPostAction,
  publishPostAction,
  archivePostAction,
  type ProfileActionResult,
} from "@/app/actions/profiles";
import { AgentProfileForm } from "@/components/profiles/agent-profile-form";
import { Button } from "@/components/ui/button";

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

export function AgentProfileWorkspace({
  organizationId,
  organizationName,
  profileId,
  publicUsername,
  visibility,
  displayName,
  professionalTitle,
  avatarUrl: initialAvatar,
  profileDefaults,
  saveProfileAction,
  initialPosts,
}: Props) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarOk, setAvatarOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [composer, setComposer] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [postError, setPostError] = useState<string | null>(null);
  const [postOk, setPostOk] = useState(false);
  const [posts, setPosts] = useState(initialPosts);
  const [pending, startTransition] = useTransition();
  const [showEdit, setShowEdit] = useState(!profileId);

  async function onChangePhoto(file: File | null) {
    if (!file || !profileId) return;
    setAvatarBusy(true);
    setAvatarError(null);
    setAvatarOk(false);
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
        setAvatarError(
          data.error?.message ??
            "Could not update photo. Check storage configuration.",
        );
        return;
      }
      setAvatarUrl(data.avatarUrl ?? null);
      setAvatarOk(true);
    } catch {
      setAvatarError("Could not update photo. Please try again.");
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
      return;
    }
    if (!composer.trim() && !pendingImage) return;
    setPostError(null);
    setPostOk(false);
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

        const fd = new FormData();
        fd.set("agentProfileId", profileId);
        fd.set("body", composer.trim() || " ");
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
        setPostOk(true);
        // Optimistic local feed entry
        setPosts((prev) => [
          {
            id: `local-${Date.now()}`,
            body: composer.trim() || "",
            type: mediaUrl ? "IMAGE" : "TEXT",
            mediaUrl: mediaUrl ?? null,
            visibility: "PUBLIC",
            publishedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
        // Reload from server for real IDs
        window.location.reload();
      } catch {
        setPostError("Could not publish. Please try again.");
      }
    });
  }

  async function onPublishDraft(postId: string) {
    const fd = new FormData();
    fd.set("postId", postId);
    startTransition(async () => {
      const result = await publishPostAction(fd);
      if (!result.ok) setPostError(result.error);
      else window.location.reload();
    });
  }

  async function onArchive(postId: string) {
    const fd = new FormData();
    fd.set("postId", postId);
    startTransition(async () => {
      const result = await archivePostAction(fd);
      if (!result.ok) setPostError(result.error);
      else setPosts((prev) => prev.filter((p) => p.id !== postId));
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header card */}
      <section className="rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex flex-col items-center gap-2">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-24 w-24 rounded-2xl border border-[var(--cv-border,#e4e4e2)] object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-[#f3f3f1] text-2xl font-medium text-[#5c5c5c]">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              capture="user"
              className="hidden"
              onChange={(e) => void onChangePhoto(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={!profileId || avatarBusy}
              onClick={() => fileRef.current?.click()}
              className="text-sm font-medium text-[var(--cv-accent,#1f4e3d)] hover:underline disabled:opacity-50"
            >
              {avatarBusy ? "Uploading…" : "Change photo"}
            </button>
            {avatarOk ? (
              <p className="text-xs text-[var(--cv-accent,#1f4e3d)]">Photo updated</p>
            ) : null}
            {avatarError ? (
              <p className="max-w-[10rem] text-center text-xs text-red-700" role="alert">
                {avatarError}
              </p>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl tracking-tight text-[var(--cv-fg,#141414)]">
              {displayName}
            </h1>
            {professionalTitle ? (
              <p className="mt-1 text-sm text-[var(--cv-fg-secondary,#3f3f3f)]">
                {professionalTitle}
              </p>
            ) : null}
            <p className="mt-2 text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
              {organizationName}
              {publicUsername ? ` · @${publicUsername}` : ""}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowEdit((v) => !v)}
                className="rounded-xl border border-[var(--cv-border,#e4e4e2)] bg-white px-3 py-2 text-sm font-medium hover:bg-[#f8f8f7]"
              >
                {showEdit ? "Hide editor" : "Edit profile"}
              </button>
              {visibility === "PUBLIC" && publicUsername ? (
                <Link
                  href={`/agents/${publicUsername}`}
                  className="rounded-xl bg-[var(--cv-accent,#1f4e3d)] px-3 py-2 text-sm font-medium text-white hover:opacity-95"
                >
                  View public profile
                </Link>
              ) : (
                <span className="rounded-xl border border-dashed border-[var(--cv-border,#e4e4e2)] px-3 py-2 text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
                  Set visibility to Public to share
                </span>
              )}
            </div>
          </div>
        </div>

        {showEdit ? (
          <div className="mt-6 border-t border-[var(--cv-border,#e4e4e2)] pt-6">
            <AgentProfileForm
              organizationId={organizationId}
              action={saveProfileAction}
              defaults={profileDefaults}
            />
          </div>
        ) : null}
      </section>

      {/* Composer */}
      {profileId ? (
        <section className="rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex gap-3">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3f3f1] text-sm font-medium">
                {displayName.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <textarea
                value={composer}
                onChange={(e) => setComposer(e.target.value)}
                rows={3}
                placeholder="Share an update…"
                disabled={pending}
                className="w-full resize-none rounded-xl border border-[var(--cv-border,#e4e4e2)] px-3 py-2.5 text-sm outline-none focus:border-[var(--cv-accent,#1f4e3d)]"
              />
              {pendingPreview ? (
                <div className="flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingPreview}
                    alt="Selected"
                    className="h-20 w-20 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={clearPendingImage}
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="cursor-pointer rounded-xl border border-[var(--cv-border,#e4e4e2)] px-3 py-2 text-sm font-medium hover:bg-[#f8f8f7]">
                  Photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
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
                  disabled={pending || (!composer.trim() && !pendingImage)}
                  onClick={() => void publish()}
                >
                  {pending ? "Publishing…" : "Publish"}
                </Button>
              </div>
              {postError ? (
                <p className="text-sm text-red-700" role="alert">
                  {postError}
                </p>
              ) : null}
              {postOk ? (
                <p className="text-sm text-[var(--cv-accent,#1f4e3d)]">Posted</p>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-[var(--cv-border,#e4e4e2)] bg-white p-4 text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
          Save your profile details first, then you can post updates.
        </p>
      )}

      {/* Feed */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Your posts</h2>
        {posts.filter((p) => p.visibility !== "ARCHIVED").length === 0 ? (
          <p className="text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
            No posts yet. Share an update above.
          </p>
        ) : (
          posts
            .filter((p) => p.visibility !== "ARCHIVED")
            .map((post) => (
              <article
                key={post.id}
                className="rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <div className="flex items-start gap-3">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3f3f1] text-sm">
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-medium text-[var(--cv-fg,#141414)]">
                        {displayName}
                      </span>
                      {professionalTitle ? (
                        <span className="text-xs text-[var(--cv-fg-muted,#5c5c5c)]">
                          {professionalTitle}
                        </span>
                      ) : null}
                      <span className="text-xs text-[var(--cv-fg-muted,#5c5c5c)]">
                        {post.publishedAt
                          ? new Date(post.publishedAt).toLocaleString()
                          : new Date(post.createdAt).toLocaleString()}
                        {post.visibility === "DRAFT" ? " · Draft" : ""}
                      </span>
                    </div>
                    {post.body.trim() ? (
                      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-7 text-[var(--cv-fg,#141414)]">
                        {post.body}
                      </p>
                    ) : null}
                    {post.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.mediaUrl}
                        alt=""
                        className="mt-3 max-h-96 w-full rounded-xl object-cover"
                      />
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-3 text-sm">
                      {post.visibility === "DRAFT" ? (
                        <button
                          type="button"
                          className="font-medium text-[var(--cv-accent,#1f4e3d)] hover:underline"
                          disabled={pending}
                          onClick={() => void onPublishDraft(post.id)}
                        >
                          Publish
                        </button>
                      ) : null}
                      {!post.id.startsWith("local-") ? (
                        <button
                          type="button"
                          className="text-[var(--cv-fg-muted,#5c5c5c)] hover:underline"
                          disabled={pending}
                          onClick={() => void onArchive(post.id)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))
        )}
      </section>
    </div>
  );
}
