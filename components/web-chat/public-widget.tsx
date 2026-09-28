"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Attachment = { id: string; mediaUrl: string; mimeType: string };

type ChatMessage = {
  id: string;
  body: string;
  senderType: string;
  createdAt: string;
  attachments?: Attachment[];
  pending?: boolean;
};

type Props = {
  publicKey: string;
  displayName: string;
  welcomeMessage?: string | null;
  avatarUrl?: string | null;
  profileHref?: string | null;
  verified?: boolean;
  /** Open chat automatically (e.g. ?chat=1) */
  autoOpen?: boolean;
  /** full = primary page experience; launcher = button + modal */
  variant?: "launcher" | "full";
};

const TOKEN_KEY = "convora_wc_session";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function PublicWebChatWidget({
  publicKey,
  displayName,
  welcomeMessage,
  avatarUrl,
  profileHref,
  verified,
  autoOpen = false,
  variant = "launcher",
}: Props) {
  const [open, setOpen] = useState(autoOpen || variant === "full");
  const [token, setToken] = useState<string | null>(null);
  const [needsIdentity, setNeedsIdentity] = useState(true);
  const [visitorName, setVisitorName] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composer, setComposer] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [sending, setSending] = useState(false);
  const [identitySaving, setIdentitySaving] = useState(false);
  const [booting, setBooting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const welcome =
    welcomeMessage?.trim() ||
    `Hi, I'm ${displayName.split(" ")[0] || displayName}. How can I help you today?`;

  const scrollBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const startSession = useCallback(async () => {
    setBooting(true);
    setError(null);
    try {
      const existing =
        typeof window !== "undefined"
          ? window.localStorage.getItem(TOKEN_KEY)
          : null;
      const res = await fetch("/api/web-chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey,
          sessionToken: existing,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data.error?.message ??
            "We couldn't open chat right now. Please try again in a moment.",
        );
        return null;
      }
      const nextToken = data.sessionToken as string;
      window.localStorage.setItem(TOKEN_KEY, nextToken);
      setToken(nextToken);
      setNeedsIdentity(Boolean(data.needsIdentity));
      if (data.identity?.displayName) {
        setVisitorName(data.identity.displayName as string);
      }
      return nextToken as string;
    } catch {
      setError("You're offline. Check your connection and try again.");
      return null;
    } finally {
      setBooting(false);
    }
  }, [publicKey]);

  const loadMessages = useCallback(async (sessionToken: string) => {
    try {
      const res = await fetch("/api/web-chat/messages", {
        headers: { "x-convora-visitor-token": sessionToken },
      });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(
        (data.messages ?? []).map(
          (m: {
            id: string;
            body: string;
            role?: string;
            senderType?: string;
            createdAt: string;
            attachments?: Attachment[];
          }) => ({
            id: m.id,
            body: m.body,
            senderType:
              m.senderType ??
              (m.role === "visitor" ? "CUSTOMER" : "MEMBERSHIP"),
            createdAt: m.createdAt,
            attachments: m.attachments ?? [],
          }),
        ),
      );
    } catch {
      /* keep existing */
    }
  }, []);

  async function openChat() {
    setOpen(true);
    const sessionToken = token ?? (await startSession());
    if (sessionToken && !needsIdentity) {
      await loadMessages(sessionToken);
    }
  }

  useEffect(() => {
    if ((autoOpen || variant === "full") && !token) {
      void (async () => {
        const t = await startSession();
        if (t) {
          // needsIdentity state set inside startSession; load after tick
        }
      })();
    }
  }, [autoOpen, variant, token, startSession]);

  useEffect(() => {
    if (open && token && !needsIdentity) {
      void loadMessages(token);
      const id = window.setInterval(() => {
        void loadMessages(token);
      }, 4000);
      return () => window.clearInterval(id);
    }
  }, [open, token, needsIdentity, loadMessages]);

  useEffect(() => {
    scrollBottom();
  }, [messages, needsIdentity]);

  async function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    if (!token || identitySaving) return;
    setIdentitySaving(true);
    setError(null);
    try {
      const res = await fetch("/api/web-chat/identity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-convora-visitor-token": token,
        },
        body: JSON.stringify({
          displayName: nameInput,
          email: emailInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not save your details.");
        return;
      }
      setVisitorName(data.identity?.displayName ?? nameInput.trim());
      setNeedsIdentity(false);
      await loadMessages(token);
    } catch {
      setError("You're offline. Check your connection and try again.");
    } finally {
      setIdentitySaving(false);
    }
  }

  function clearPendingImage() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingImage(null);
    setPendingPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send() {
    if ((!composer.trim() && !pendingImage) || sending || needsIdentity) return;
    let sessionToken = token;
    if (!sessionToken) {
      sessionToken = await startSession();
      if (!sessionToken) return;
    }
    const bodyText = composer.trim();
    setSending(true);
    setError(null);
    const optimisticId = `local-${Date.now()}`;
    if (bodyText || pendingPreview) {
      setMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          body: bodyText || " ",
          senderType: "CUSTOMER",
          createdAt: new Date().toISOString(),
          pending: true,
          attachments: pendingPreview
            ? [
                {
                  id: "local",
                  mediaUrl: pendingPreview,
                  mimeType: "image/*",
                },
              ]
            : [],
        },
      ]);
    }
    try {
      let mediaId: string | undefined;
      if (pendingImage) {
        const fd = new FormData();
        fd.set("publicKey", publicKey);
        fd.set("sessionToken", sessionToken);
        fd.set("image", pendingImage);
        const up = await fetch("/api/web-chat/attachments", {
          method: "POST",
          body: fd,
        });
        const upData = await up.json();
        if (!up.ok) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
          setError(upData.error?.message ?? "Image upload failed.");
          return;
        }
        mediaId = upData.mediaId as string;
      }

      const res = await fetch("/api/web-chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-convora-visitor-token": sessionToken,
        },
        body: JSON.stringify({
          body: bodyText || (mediaId ? " " : ""),
          mediaId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setError(data.error?.message ?? "Could not send message.");
        return;
      }
      setComposer("");
      clearPendingImage();
      await loadMessages(sessionToken);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setError("You're offline. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  function onComposerKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const chatPanel = (
    <div
      className={cn(
        "flex flex-col bg-white",
        variant === "full"
          ? "h-[min(100dvh,900px)] min-h-[28rem] w-full overflow-hidden rounded-2xl border border-[var(--cv-border)] shadow-sm"
          : "h-[min(100dvh,640px)] w-full max-w-md overflow-hidden rounded-t-2xl sm:h-[min(90dvh,640px)] sm:rounded-2xl",
      )}
    >
      {/* Header */}
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--cv-border)] px-3 py-2.5">
        {variant === "launcher" ? (
          <button
            type="button"
            aria-label="Close chat"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--cv-fg-muted)] hover:bg-[#f3f3f1] sm:hidden"
            onClick={() => setOpen(false)}
          >
            ←
          </button>
        ) : null}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => setInfoOpen(true)}
          aria-label={`About ${displayName}`}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--cv-accent-soft,#e8f2ed)] text-xs font-semibold text-[var(--cv-accent)]">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials(displayName)
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-[var(--cv-fg)]">
                {displayName}
              </span>
              {verified ? (
                <span className="text-[10px] font-medium text-[var(--cv-accent)]">
                  ✓
                </span>
              ) : null}
            </span>
            <span className="block truncate text-xs text-[var(--cv-fg-muted)]">
              Usually replies during business hours
            </span>
          </span>
        </button>
        {variant === "launcher" ? (
          <button
            type="button"
            aria-label="Close"
            className="hidden h-10 w-10 items-center justify-center rounded-full text-[var(--cv-fg-muted)] hover:bg-[#f3f3f1] sm:flex"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        ) : null}
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#f7f7f5] px-3 py-4">
        {booting ? (
          <p className="text-center text-sm text-[var(--cv-fg-muted)]">
            Connecting…
          </p>
        ) : needsIdentity ? (
          <div className="mx-auto max-w-sm space-y-4">
            <div className="rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm leading-6 text-[var(--cv-fg)] shadow-sm">
              {welcome}
            </div>
            <div className="rounded-2xl border border-[var(--cv-border)] bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-[var(--cv-fg)]">
                Let&apos;s get you connected
              </h2>
              <p className="mt-1 text-xs text-[var(--cv-fg-muted)]">
                Before we start, tell us your name. No account required.
              </p>
              <form onSubmit={(e) => void submitIdentity(e)} className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="wc-name"
                    className="mb-1 block text-xs font-medium text-[var(--cv-fg)]"
                  >
                    Name
                  </label>
                  <input
                    id="wc-name"
                    required
                    minLength={2}
                    maxLength={120}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoComplete="name"
                    className="w-full rounded-xl border border-[var(--cv-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--cv-accent)] focus:ring-2 focus:ring-[var(--cv-accent)]/15"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label
                    htmlFor="wc-email"
                    className="mb-1 block text-xs font-medium text-[var(--cv-fg)]"
                  >
                    Email <span className="font-normal text-[var(--cv-fg-muted)]">(optional)</span>
                  </label>
                  <input
                    id="wc-email"
                    type="email"
                    maxLength={254}
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    autoComplete="email"
                    className="w-full rounded-xl border border-[var(--cv-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--cv-accent)] focus:ring-2 focus:ring-[var(--cv-accent)]/15"
                    placeholder="you@example.com"
                  />
                </div>
                {error ? (
                  <p className="text-sm text-red-700" role="alert">
                    {error}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={identitySaving || nameInput.trim().length < 2}
                  className="flex min-h-11 w-full items-center justify-center rounded-xl bg-[var(--cv-accent)] text-sm font-medium text-white hover:opacity-95 disabled:opacity-50"
                >
                  {identitySaving ? "Continuing…" : "Continue to chat"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-sm leading-6 text-[var(--cv-fg)] shadow-sm">
              {welcome}
            </div>
            {messages.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--cv-fg-muted)]">
                Send a message to start the conversation
                {visitorName ? `, ${visitorName.split(" ")[0]}` : ""}.
              </p>
            ) : null}
            {messages.map((m) => {
              const mine = m.senderType === "CUSTOMER";
              return (
                <div
                  key={m.id}
                  className={cn("flex", mine ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-5 shadow-sm",
                      mine
                        ? "rounded-br-md bg-[var(--cv-accent)] text-white"
                        : "rounded-bl-md bg-white text-[var(--cv-fg)]",
                    )}
                  >
                    {m.body.trim() && m.body.trim() !== " " ? (
                      <p className="whitespace-pre-wrap">{m.body}</p>
                    ) : null}
                    {m.attachments?.map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={a.id}
                        src={a.mediaUrl}
                        alt="Attachment"
                        className="mt-1.5 max-h-48 rounded-lg object-cover"
                      />
                    ))}
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        mine ? "text-white/70" : "text-[var(--cv-fg-muted)]",
                      )}
                    >
                      {m.pending ? "Sending…" : formatTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      {!needsIdentity ? (
        <div className="shrink-0 border-t border-[var(--cv-border)] bg-white px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {pendingPreview ? (
            <div className="mb-2 flex items-center gap-2 px-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={pendingPreview}
                alt="Selected"
                className="h-14 w-14 rounded-lg object-cover"
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
          {error ? (
            <p className="mb-1 px-1 text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              aria-label="Attach image"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--cv-fg-muted)] hover:bg-[#f3f3f1]"
              onClick={() => fileRef.current?.click()}
              disabled={sending}
            >
              +
            </button>
            <input
              ref={fileRef}
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
            <textarea
              ref={textareaRef}
              rows={1}
              value={composer}
              onChange={(e) => setComposer(e.target.value)}
              onKeyDown={onComposerKey}
              placeholder="Message…"
              disabled={sending}
              className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-[var(--cv-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--cv-accent)]"
            />
            <button
              type="button"
              aria-label="Send message"
              disabled={sending || (!composer.trim() && !pendingImage)}
              onClick={() => void send()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--cv-accent)] text-sm font-semibold text-white disabled:opacity-40"
            >
              {sending ? "…" : "↑"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Info sheet */}
      {infoOpen ? (
        <div
          className="absolute inset-0 z-10 flex flex-col bg-white"
          role="dialog"
          aria-label="Profile info"
        >
          <header className="flex items-center gap-2 border-b border-[var(--cv-border)] px-3 py-2.5">
            <button
              type="button"
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-[#f3f3f1]"
              onClick={() => setInfoOpen(false)}
            >
              ←
            </button>
            <h2 className="text-sm font-semibold">About</h2>
          </header>
          <div className="flex flex-1 flex-col items-center gap-3 p-6 text-center">
            <span className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[var(--cv-accent-soft,#e8f2ed)] text-lg font-semibold text-[var(--cv-accent)]">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials(displayName)
              )}
            </span>
            <div>
              <p className="text-lg font-semibold">{displayName}</p>
              <p className="text-sm text-[var(--cv-fg-muted)]">
                Usually replies during business hours
              </p>
            </div>
            {profileHref ? (
              <Link
                href={profileHref}
                className="mt-2 rounded-xl border border-[var(--cv-border)] px-4 py-2.5 text-sm font-medium hover:bg-[#f8f8f7]"
              >
                View full profile
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (variant === "full") {
    return <div className="relative w-full">{chatPanel}</div>;
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--cv-border)] bg-white p-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] sm:hidden">
        <button
          type="button"
          onClick={() => void openChat()}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--cv-accent)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
        >
          Message {displayName.split(" ")[0] || "us"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => void openChat()}
        className="hidden min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--cv-accent)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)] sm:flex"
      >
        Message {displayName.split(" ")[0] || "us"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Chat with ${displayName}`}
        >
          <div className="relative w-full max-w-md sm:w-full">{chatPanel}</div>
        </div>
      ) : null}
    </>
  );
}
