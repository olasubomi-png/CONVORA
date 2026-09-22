"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  body: string;
  senderType: string;
  createdAt: string;
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
  const [error, setError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
            senderType: string;
            createdAt: string;
          }) => ({
            id: m.id,
            body: m.body,
            senderType: m.senderType,
            createdAt: m.createdAt,
          }),
        ),
      );
    } catch {
      /* keep existing */
    }
  }, []);

  async function openChat() {
    setOpen(true);
    const t = token ?? (await startSession());
    if (t) await loadMessages(t);
  }

  async function send() {
    if (!composer.trim()) return;
    let sessionToken = token;
    if (!sessionToken) {
      sessionToken = await startSession();
      if (!sessionToken) return;
    }
    setSending(true);
    setError(null);
    const body = composer.trim();
    setComposer("");
    try {
      const res = await fetch("/api/web-chat/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-convora-visitor-token": sessionToken,
        },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setComposer(body);
        setError(
          data.error?.message ??
            "We couldn't send your message. Please try again.",
        );
        return;
      }
      await loadMessages(sessionToken);
      scrollBottom();
    } catch {
      setComposer(body);
      setError("You're offline. Check your connection and try again.");
    } finally {
      setSending(false);
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

  return (
    <>
      {/* Sticky CTA on mobile */}
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
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-[var(--cv-border)] bg-white px-3.5 py-2.5 text-sm text-[var(--cv-fg)] shadow-sm">
                  {welcomeMessage}
                </div>
              ) : null}
              {!welcomeMessage && messages.length === 0 && !booting ? (
                <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-[var(--cv-border)] bg-white px-3.5 py-2.5 text-sm text-[var(--cv-fg)] shadow-sm">
                  Hi! How can we help?
                </div>
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
                      <p className="whitespace-pre-wrap">{m.body}</p>
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
              <div className="flex gap-2">
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
                  disabled={sending || booting || !composer.trim()}
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
