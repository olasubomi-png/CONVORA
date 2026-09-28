"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  conversationId: string | null;
  channel: string | null;
  readAt: string | null;
  createdAt: string;
  customerAvatarUrl?: string | null;
};

function relativeTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotificationBell({
  organizationId,
}: {
  organizationId: string;
  membershipId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastUnread = useRef(0);

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/notifications?organizationId=${encodeURIComponent(organizationId)}`,
      );
      if (!res.ok) {
        setError("Could not load notifications.");
        return;
      }
      const data = await res.json();
      const nextUnread = data.unreadCount ?? 0;
      lastUnread.current = nextUnread;
      setUnread(nextUnread);
      setItems(
        (data.notifications ?? []).map(
          (n: NotificationItem & { createdAt: string | Date }) => ({
            ...n,
            createdAt:
              typeof n.createdAt === "string"
                ? n.createdAt
                : new Date(n.createdAt).toISOString(),
          }),
        ),
      );
    } catch {
      setError("Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function markOne(id: string, conversationId: string | null) {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(
      () => undefined,
    );
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    setUnread((u) => Math.max(0, u - 1));
    setOpen(false);
    if (conversationId) {
      router.push(`/app/inbox?c=${conversationId}`);
    }
  }

  async function markAll() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        action: "mark_all_read",
      }),
    }).catch(() => undefined);
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
  }

  async function enablePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const vapidRes = await fetch("/api/notifications/vapid");
      const vapid = await vapidRes.json();
      if (!vapid.configured || !vapid.publicKey) return;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey as string),
      });
      const json = sub.toJSON();
      await fetch("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });
    } catch {
      /* optional */
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        className="relative rounded-lg p-2 text-[var(--cv-fg-secondary)] hover:bg-[var(--cv-surface-muted)]"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-[var(--cv-border)] bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--cv-border)] px-3 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-[var(--cv-accent)] hover:underline"
                onClick={() => void enablePush()}
              >
                Enable push
              </button>
              {unread > 0 ? (
                <button
                  type="button"
                  className="text-xs text-[var(--cv-fg-muted)] hover:underline"
                  onClick={() => void markAll()}
                >
                  Mark all read
                </button>
              ) : null}
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-[var(--cv-fg-muted)]">
                Loading…
              </p>
            ) : error ? (
              <p className="px-3 py-8 text-center text-sm text-red-700">{error}</p>
            ) : items.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-[var(--cv-fg-muted)]">
                You&apos;re all caught up.
              </p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full gap-3 px-3 py-3 text-left hover:bg-[#f8f8f7]",
                        !n.readAt && "bg-[var(--cv-accent-soft,#e8f2ed)]/40",
                      )}
                      onClick={() => void markOne(n.id, n.conversationId)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                        {n.customerAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={n.customerAvatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          initials(n.title)
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium">
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[11px] text-[var(--cv-fg-muted)]">
                            {relativeTime(n.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-xs text-[var(--cv-fg-secondary)]">
                          {n.body}
                        </span>
                        {n.channel ? (
                          <span className="mt-1 inline-block text-[10px] font-medium uppercase tracking-wide text-[var(--cv-fg-muted)]">
                            {n.channel}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
