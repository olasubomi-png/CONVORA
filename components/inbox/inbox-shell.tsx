"use client";

import { useCallback, useEffect, useState } from "react";
import { AiCopilotPanel } from "@/components/ai/copilot-panel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ConversationRow = {
  id: string;
  status: string;
  priority: string;
  channel: string;
  subject: string | null;
  lastMessageAt: string | Date | null;
  assignedToMembershipId: string | null;
  createdAt: string | Date;
  customer: { id: string; displayName: string };
  unread: boolean;
};

type MessageRow = {
  id: string;
  body: string;
  senderType: string;
  createdAt: string;
};

type NoteRow = {
  id: string;
  body: string;
  createdAt: string;
};

type Props = {
  organizationId: string;
  organizationName: string;
  membershipId: string;
  conversations: ConversationRow[];
  selectedId?: string;
  userId: string;
};

function channelTone(
  channel: string,
): "whatsapp" | "webchat" | "email" | "instagram" | "facebook" | "neutral" {
  const c = channel.toUpperCase();
  if (c.includes("WHATSAPP")) return "whatsapp";
  if (c.includes("WEB") || c.includes("CHAT")) return "webchat";
  if (c.includes("EMAIL")) return "email";
  if (c.includes("INSTAGRAM")) return "instagram";
  if (c.includes("FACEBOOK") || c.includes("MESSENGER")) return "facebook";
  return "neutral";
}

function statusTone(
  status: string,
): "accent" | "warning" | "success" | "neutral" {
  const s = status.toUpperCase();
  if (s === "OPEN") return "accent";
  if (s === "PENDING") return "warning";
  if (s === "RESOLVED" || s === "CLOSED") return "success";
  return "neutral";
}

function formatTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function InboxShell({
  organizationName,
  membershipId,
  conversations: initial,
  selectedId,
}: Props) {
  const [conversations] = useState(initial);
  const [selected, setSelected] = useState<string | undefined>(selectedId);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [detail, setDetail] = useState<{
    status: string;
    priority: string;
    customerName: string;
  } | null>(null);
  const [composer, setComposer] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [tab, setTab] = useState<"reply" | "note">("reply");

  const loadThread = useCallback(async (id: string) => {
    setError(null);
    const [msgRes, noteRes, detRes] = await Promise.all([
      fetch(`/api/conversations/${id}/messages`),
      fetch(`/api/conversations/${id}/notes`),
      fetch(`/api/conversations/${id}`),
    ]);
    if (!msgRes.ok || !detRes.ok) {
      setError("Unable to load conversation.");
      return;
    }
    const msgJson = await msgRes.json();
    const noteJson = noteRes.ok ? await noteRes.json() : { notes: [] };
    const detJson = await detRes.json();
    setMessages(
      (msgJson.messages ?? []).map(
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
    setNotes(
      (noteJson.notes ?? []).map(
        (n: { id: string; body: string; createdAt: string }) => ({
          id: n.id,
          body: n.body,
          createdAt: n.createdAt,
        }),
      ),
    );
    setDetail({
      status: detJson.conversation?.status ?? detJson.status ?? "",
      priority: detJson.conversation?.priority ?? detJson.priority ?? "",
      customerName:
        detJson.conversation?.customer?.displayName ??
        detJson.customer?.displayName ??
        "Customer",
    });
  }, []);

  useEffect(() => {
    if (selected) void loadThread(selected);
  }, [selected, loadThread]);

  async function sendMessage() {
    if (!selected || !composer.trim()) return;
    setPending(true);
    try {
      const res = await fetch(`/api/conversations/${selected}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: composer }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to send");
        return;
      }
      setComposer("");
      await loadThread(selected);
    } finally {
      setPending(false);
    }
  }

  async function sendNote() {
    if (!selected || !noteBody.trim()) return;
    setPending(true);
    try {
      const res = await fetch(`/api/conversations/${selected}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to add note");
        return;
      }
      setNoteBody("");
      await loadThread(selected);
    } finally {
      setPending(false);
    }
  }

  async function setStatus(status: string) {
    if (!selected) return;
    const res = await fetch(`/api/conversations/${selected}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await loadThread(selected);
  }

  async function assignSelf() {
    if (!selected) return;
    await fetch(`/api/conversations/${selected}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ membershipId }),
    });
    await loadThread(selected);
  }

  const selectedConv = conversations.find((c) => c.id === selected);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col lg:flex-row">
      {/* Conversation list */}
      <aside
        className={cn(
          "flex w-full flex-col border-r border-[var(--cv-border)] bg-white lg:w-[340px] lg:shrink-0",
          selected ? "hidden lg:flex" : "flex",
        )}
      >
        <div className="border-b border-[var(--cv-border)] px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-semibold text-[var(--cv-fg)]">
              Conversations
            </h1>
            <span className="text-xs text-[var(--cv-fg-muted)]">
              {conversations.length} total
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--cv-fg-muted)]">
            {organizationName}
          </p>
          <div className="mt-3">
            <input
              type="search"
              placeholder="Search conversations…"
              className="w-full rounded-xl border border-[var(--cv-border)] bg-[var(--cv-surface-muted)] px-3 py-2 text-sm outline-none focus:border-[var(--cv-accent)] focus:ring-2 focus:ring-[var(--cv-accent-ring)]"
              aria-label="Search conversations"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <li className="px-4 py-12 text-center text-sm text-[var(--cv-fg-muted)]">
              <p className="font-medium text-[var(--cv-fg)]">No conversations yet</p>
              <p className="mt-1 text-xs">
                Connect a channel or create a customer conversation to get
                started.
              </p>
            </li>
          ) : (
            conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={cn(
                    "w-full border-b border-[var(--cv-border)] px-4 py-3 text-left transition-colors hover:bg-[var(--cv-surface-muted)]",
                    selected === c.id && "bg-[var(--cv-accent-soft)]",
                  )}
                >
                  <div className="flex gap-3">
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        selected === c.id
                          ? "bg-[var(--cv-accent)] text-white"
                          : "bg-slate-100 text-slate-600",
                      )}
                    >
                      {initials(c.customer.displayName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-[var(--cv-fg)]">
                          {c.customer.displayName}
                        </p>
                        <span className="shrink-0 text-[11px] text-[var(--cv-fg-subtle)]">
                          {formatTime(c.lastMessageAt ?? c.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[var(--cv-fg-muted)]">
                        {c.subject ?? "Conversation"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={channelTone(c.channel)}>{c.channel}</Badge>
                        <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                        {c.unread ? (
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--cv-accent)]" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
      </aside>

      {/* Thread */}
      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col bg-[var(--cv-surface-muted)]",
          !selected ? "hidden lg:flex" : "flex",
        )}
      >
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
              <span className="text-lg text-[var(--cv-accent)]">✉</span>
            </div>
            <p className="text-sm font-medium text-[var(--cv-fg)]">
              Select a conversation
            </p>
            <p className="max-w-xs text-xs text-[var(--cv-fg-muted)]">
              Choose a thread from the list to reply, assign, and use AI assist.
            </p>
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cv-border)] bg-white px-4 py-3 lg:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-[var(--cv-fg-muted)] hover:bg-slate-100 lg:hidden"
                  onClick={() => setSelected(undefined)}
                  aria-label="Back to list"
                >
                  ←
                </button>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cv-accent-soft)] text-xs font-semibold text-[var(--cv-accent)]">
                  {initials(detail?.customerName ?? "C")}
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--cv-fg)]">
                    {detail?.customerName ?? "Conversation"}
                  </h2>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {selectedConv ? (
                      <Badge tone={channelTone(selectedConv.channel)}>
                        {selectedConv.channel}
                      </Badge>
                    ) : null}
                    {detail?.status ? (
                      <Badge tone={statusTone(detail.status)}>
                        {detail.status}
                      </Badge>
                    ) : null}
                    {detail?.priority ? (
                      <Badge tone="warning">{detail.priority}</Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["OPEN", "PENDING", "CLOSED"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void setStatus(s)}
                    className="rounded-lg border border-[var(--cv-border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--cv-fg-secondary)] hover:bg-[var(--cv-surface-muted)]"
                  >
                    {s === "CLOSED" ? "Close" : s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void assignSelf()}
                  className="rounded-lg bg-[var(--cv-accent)] px-2.5 py-1 text-xs font-medium text-white hover:bg-[var(--cv-accent-hover)]"
                >
                  Assign to me
                </button>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 lg:px-6">
              {messages.map((m) => {
                const outbound =
                  m.senderType === "AGENT" || m.senderType === "SYSTEM";
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
                        "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[70%]",
                        outbound
                          ? "rounded-br-md bg-[var(--cv-accent)] text-white"
                          : "rounded-bl-md border border-[var(--cv-border)] bg-white text-[var(--cv-fg)]",
                      )}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          outbound ? "text-blue-100" : "text-[var(--cv-fg-subtle)]",
                        )}
                      >
                        {formatTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              {notes.length > 0 ? (
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                    Internal notes
                  </p>
                  {notes.map((n) => (
                    <p key={n.id} className="mt-2 text-sm text-amber-900">
                      {n.body}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            {error ? (
              <p className="px-4 text-sm text-[var(--cv-danger)] lg:px-6" role="alert">
                {error}
              </p>
            ) : null}

            <footer className="border-t border-[var(--cv-border)] bg-white p-3 lg:p-4">
              <div className="mb-2 flex gap-3 text-sm">
                <button
                  type="button"
                  className={cn(
                    "border-b-2 pb-1 font-medium",
                    tab === "reply"
                      ? "border-[var(--cv-accent)] text-[var(--cv-accent)]"
                      : "border-transparent text-[var(--cv-fg-muted)]",
                  )}
                  onClick={() => setTab("reply")}
                >
                  Reply
                </button>
                <button
                  type="button"
                  className={cn(
                    "border-b-2 pb-1 font-medium",
                    tab === "note"
                      ? "border-[var(--cv-accent)] text-[var(--cv-accent)]"
                      : "border-transparent text-[var(--cv-fg-muted)]",
                  )}
                  onClick={() => setTab("note")}
                >
                  Internal note
                </button>
              </div>
              {tab === "reply" ? (
                <div className="flex gap-2">
                  <textarea
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    rows={2}
                    placeholder="Type a message…"
                    className="flex-1 resize-none rounded-xl border border-[var(--cv-border)] px-3 py-2 text-sm outline-none focus:border-[var(--cv-accent)] focus:ring-2 focus:ring-[var(--cv-accent-ring)]"
                    disabled={pending}
                  />
                  <button
                    type="button"
                    onClick={() => void sendMessage()}
                    disabled={pending}
                    className="self-end rounded-xl bg-[var(--cv-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)] disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    placeholder="Internal note (staff only)…"
                    className="flex-1 rounded-xl border border-[var(--cv-border)] px-3 py-2 text-sm outline-none focus:border-[var(--cv-accent)] focus:ring-2 focus:ring-[var(--cv-accent-ring)]"
                    disabled={pending}
                  />
                  <button
                    type="button"
                    onClick={() => void sendNote()}
                    disabled={pending}
                    className="rounded-xl border border-[var(--cv-border)] bg-white px-4 py-2 text-sm font-medium hover:bg-[var(--cv-surface-muted)] disabled:opacity-50"
                  >
                    Add note
                  </button>
                </div>
              )}
            </footer>
          </>
        )}
      </section>

      {/* Context / AI */}
      {selected ? (
        <aside className="hidden w-80 shrink-0 flex-col border-l border-[var(--cv-border)] bg-white xl:flex">
          <div className="border-b border-[var(--cv-border)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--cv-fg)]">Customer</p>
            <p className="mt-1 text-sm text-[var(--cv-fg-secondary)]">
              {detail?.customerName ?? "—"}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <AiCopilotPanel conversationId={selected} />
          </div>
        </aside>
      ) : null}

      {/* AI on smaller screens */}
      {selected ? (
        <div className="border-t border-[var(--cv-border)] bg-white p-3 xl:hidden">
          <AiCopilotPanel conversationId={selected} />
        </div>
      ) : null}
    </div>
  );
}
