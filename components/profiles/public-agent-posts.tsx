"use client";

import { useState } from "react";
import type { PublicAgentPost } from "@/lib/profiles/types";

export function PublicAgentPosts({ posts }: { posts: PublicAgentPost[] }) {
  if (posts.length === 0) {
    return (
      <p className="mt-4 text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
        No public posts yet.
      </p>
    );
  }

  return (
    <ul className="mt-6 space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </ul>
  );
}

function PostCard({ post }: { post: PublicAgentPost }) {
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<
    Array<{ id: string; body: string; authorName: string | null; createdAt: string }>
  >([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentCount, setCommentCount] = useState(post.commentCount);

  async function toggleLike() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${post.id}/likes`, {
        method: liked ? "DELETE" : "POST",
      });
      const data = (await res.json()) as {
        likeCount?: number;
        likedByMe?: boolean;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Sign in to like posts.");
        return;
      }
      setLikeCount(data.likeCount ?? likeCount);
      setLiked(Boolean(data.likedByMe));
    } finally {
      setBusy(false);
    }
  }

  async function loadComments() {
    setCommentsOpen(true);
    const res = await fetch(`/api/posts/${post.id}/comments`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      comments: Array<{
        id: string;
        body: string;
        authorName: string | null;
        createdAt: string;
      }>;
    };
    setComments(data.comments);
  }

  async function submitComment() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: commentBody }),
      });
      const data = (await res.json()) as {
        id?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Sign in to comment.");
        return;
      }
      setCommentBody("");
      setCommentCount((c) => c + 1);
      await loadComments();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-2xl border border-[var(--cv-border,#e4e4e2)] bg-white p-5 shadow-[var(--cv-shadow-sm,0_1px_2px_rgba(0,0,0,0.04))]">
      <p className="whitespace-pre-wrap text-[15px] leading-7 text-[var(--cv-fg,#141414)]">
        {post.body}
      </p>
      {post.mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.mediaUrl}
          alt=""
          className="mt-4 max-h-96 w-full rounded-xl object-cover"
        />
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[var(--cv-fg-muted,#5c5c5c)]">
        <time dateTime={post.publishedAt ?? undefined}>
          {post.publishedAt
            ? new Date(post.publishedAt).toLocaleDateString()
            : ""}
        </time>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleLike()}
          className="hover:text-[var(--cv-fg,#141414)]"
        >
          {liked ? "Liked" : "Like"} · {likeCount}
        </button>
        <button
          type="button"
          onClick={() => void loadComments()}
          className="hover:text-[var(--cv-fg,#141414)]"
        >
          Comments · {commentCount}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {commentsOpen ? (
        <div className="mt-4 space-y-3 border-t border-[var(--cv-border,#e4e4e2)] pt-4">
          {comments.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="font-medium text-[var(--cv-fg,#141414)]">
                {c.authorName ?? "Member"}
              </span>
              <p className="mt-0.5 text-[var(--cv-fg-secondary,#3f3f3f)]">
                {c.body}
              </p>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Write a comment…"
              className="min-w-0 flex-1 rounded-xl border border-[var(--cv-border,#e4e4e2)] px-3 py-2 text-sm"
              maxLength={2000}
            />
            <button
              type="button"
              disabled={busy || !commentBody.trim()}
              onClick={() => void submitComment()}
              className="rounded-xl bg-[var(--cv-accent,#1f4e3d)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Post
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
