"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Attachment = { id?: string; mediaUrl: string; mimeType?: string };

type Msg = {
  id: string;
  body: string;
  senderType: string;
  createdAt: string;
  attachments?: Attachment[];
};

const TOKEN_KEY = "cv_wc_session";

export function PublicWebChatWidget({
  publicKey,
  displayName,
  welcomeMessage,
}: {
  publicKey: string;
  displayName: string;
  welcomeMessage?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [composer, setComposer] = useState("");
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      return nextToken;
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
    if (sessionToken) {
      await loadMessages(sessionToken);
    }
  }

  useEffect(() => {
    if (open && token) {
      const id = window.setInterval(() => {
        void loadMessages(token);
      }, 4000);
      return () => window.clearInterval(id);
    }
  }, [open, token, loadMessages]);

  useEffect(() => {
    scrollBottom();
  }, [messages]);

  function clearPendingImage() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingImage(null);
    setPendingPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onPickImage(file: File | null) {
    if (!file) return;
    if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    setPendingImage(file);
    setPendingPreview(URL.createObjectURL(file));
  }

  async function send() {
    if ((!composer.trim() && !pendingImage) || sending) return;
    let sessionToken = token;
    if (!sessionToken) {
      sessionToken = await startSession();
      if (!sessionToken) return;
    }
    setSending(true);
    setError(null);
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
          body: composer.trim() || (mediaId ? " " : ""),
          mediaId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not send message.");
        return;
      }
      setComposer("");
      clearPendingImage();
      await loadMessages(sessionToken);
    } catch {
      setError("You're offline. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--cv-border)] bg-white p-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] sm:hidden">
        <button
          type="button"
          onClick={() => void openChat()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cv-accent)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
        >
          Chat with us
        </button>
      </div>

      <button
        type="button"
        onClick={() => void openChat()}
        className="hidden w-full items-center justify-center gap-2 rounded-xl bg-[var(--cv-accent)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)] sm:flex"
      >
        Chat with us
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Chat with ${displayName}`}
        >
          <div className="flex h-[min(100dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:h-[560px] sm:rounded-2xl">
            <header className="flex items-center gap-3 border-b border-[var(--cv-border)] px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[var(--cv-fg-muted)] hover:bg-slate-100"
                aria-label="Close chat"
              >
                ←
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--cv-fg)]">
                  {displayName}
                </p>
                <p className="text-[11px] text-[var(--cv-fg-muted)]">
                  Usually replies during business hours
                </p>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto bg-[var(--cv-surface-muted)] px-4 py-4">
              {booting ? (
                <p className="text-center text-sm text-[var(--cv-fg-muted)]">
                  Opening chat…
                </p>
              ) : null}
              {welcomeMessage && messages.length === 0 && !booting ? (
                <p className="text-center text-sm text-[var(--cv-fg-muted)]">
                  {welcomeMessage}
                </p>
              ) : null}
              {messages.map((m) => {
                const outbound =
                  m.senderType === "CUSTOMER" || m.senderType === "VISITOR";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "flex",
                      outbound ? "justify-end" : "justify-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                        outbound
                          ? "rounded-br-md bg-[var(--cv-accent)] text-white"
                          : "rounded-bl-md border border-[var(--cv-border)] bg-white text-[var(--cv-fg)]",
                      )}
                    >
                      {m.attachments?.map((a) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={a.mediaUrl}
                          src={a.mediaUrl}
                          alt=""
                          className="mb-2 max-h-48 w-full rounded-lg object-cover"
                        />
                      ))}
                      {m.body.trim() ? (
                        <p className="whitespace-pre-wrap">{m.body}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {error ? (
              <div className="border-t border-[var(--cv-border)] bg-[var(--cv-danger-soft)] px-4 py-2 text-sm text-[var(--cv-danger)]">
                <p role="alert">{error}</p>
                <button
                  type="button"
                  className="mt-1 font-medium underline"
                  onClick={() => void openChat()}
                >
                  Try again
                </button>
              </div>
            ) : null}

            <footer className="border-t border-[var(--cv-border)] bg-white p-3">
              {pendingPreview ? (
                <div className="mb-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingPreview}
                    alt="Selected"
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearPendingImage}
                    className="text-xs text-[var(--cv-fg-muted)] underline"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              <div className="flex gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="environment"
                  className="hidden"
                  onChange={(e) =>
                    onPickImage(e.target.files?.[0] ?? null)
                  }
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={sending || booting}
                  className="rounded-xl border border-[var(--cv-border)] px-3 py-2.5 text-sm"
                  aria-label="Attach image"
                >
                  📷
                </button>
                <label htmlFor="wc-composer" className="sr-only">
                  Write a message
                </label>
                <input
                  id="wc-composer"
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Write a message…"
                  disabled={sending || booting}
                  className="flex-1 rounded-xl border border-[var(--cv-border)] px-3 py-2.5 text-sm outline-none focus:border-[var(--cv-accent)] focus:ring-2 focus:ring-[var(--cv-accent-ring)]"
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={
                    sending ||
                    booting ||
                    (!composer.trim() && !pendingImage)
                  }
                  className="rounded-xl bg-[var(--cv-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)] disabled:opacity-50"
                  aria-label="Send message"
                >
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
