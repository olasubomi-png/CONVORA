"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AiCopilotPanel } from "@/components/ai/copilot-panel";

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
        (m: { id: string; body: string; senderType: string; createdAt: string }) => ({
          id: m.id,
          body: m.body,
          senderType: m.senderType,
          createdAt: m.createdAt,
        }),
      ),
    );
    setNotes(
      (noteJson.notes ?? []).map((n: { id: string; body: string; createdAt: string }) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt,
      })),
    );
    setDetail({
      status: detJson.conversation.status,
      priority: detJson.conversation.priority,
      customerName: detJson.customer?.displayName ?? "Customer",
    });
    await fetch(`/api/conversations/${id}/read`, { method: "POST" });
  }, []);

  useEffect(() => {
    if (selected) {
      void loadThread(selected);
    }
  }, [selected, loadThread]);

  async function sendMessage() {
    if (!selected || !composer.trim()) return;
    setPending(true);
    setError(null);
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

  return (
    <div className="flex h-[calc(100vh-3.5rem)] border-t border-[#e4e4e2]">
      <aside className="flex w-full max-w-sm flex-col border-r border-[#e4e4e2] bg-white md:w-96">
        <div className="border-b border-[#e4e4e2] px-4 py-3">
          <p className="text-xs tracking-[0.12em] text-[#5c5c5c]">INBOX</p>
          <p className="text-sm font-medium">{organizationName}</p>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <li className="px-4 py-8 text-sm text-[#5c5c5c]">
              No conversations yet. Create a customer and conversation via API
              to populate the inbox.
            </li>
          ) : (
            conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={`w-full border-b border-[#e4e4e2] px-4 py-3 text-left hover:bg-[#f8f8f7] ${
                    selected === c.id ? "bg-[#f3f3f1]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">
                      {c.customer.displayName}
                    </span>
                    {c.unread ? (
                      <span className="h-2 w-2 rounded-full bg-[#1f4e3d]" />
                    ) : null}
                  </div>
                  <div className="mt-1 flex gap-2 text-xs text-[#5c5c5c]">
                    <span>{c.status}</span>
                    <span>{c.priority}</span>
                    <span>{c.channel}</span>
                  </div>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-[#e4e4e2] p-3 text-xs text-[#5c5c5c]">
          <Link href="/app" className="hover:underline">
            ← Workspace
          </Link>
        </div>
      </aside>

      <section className="flex flex-1 flex-col bg-[#f8f8f7]">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[#5c5c5c]">
            Select a conversation
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e4e2] bg-white px-6 py-3">
              <div>
                <h1 className="text-lg tracking-tight">
                  {detail?.customerName ?? "Conversation"}
                </h1>
                <p className="text-xs text-[#5c5c5c]">
                  {detail?.status} · {detail?.priority}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="border border-[#e4e4e2] px-2 py-1 hover:bg-[#f8f8f7]"
                  onClick={() => void setStatus("OPEN")}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="border border-[#e4e4e2] px-2 py-1 hover:bg-[#f8f8f7]"
                  onClick={() => void setStatus("PENDING")}
                >
                  Pending
                </button>
                <button
                  type="button"
                  className="border border-[#e4e4e2] px-2 py-1 hover:bg-[#f8f8f7]"
                  onClick={() => void setStatus("CLOSED")}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="border border-[#141414] bg-[#141414] px-2 py-1 text-white"
                  onClick={() => void assignSelf()}
                >
                  Assign to me
                </button>
              </div>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-xl border border-[#e4e4e2] bg-white px-4 py-3 text-sm ${
                    m.senderType === "MEMBERSHIP" ? "ml-auto" : ""
                  }`}
                >
                  <p className="text-xs text-[#5c5c5c]">
                    {m.senderType === "MEMBERSHIP" ? "Agent" : m.senderType}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
              {notes.length > 0 ? (
                <div className="border border-dashed border-[#c8b56a] bg-[#fffbeb] px-4 py-3">
                  <p className="text-xs font-medium text-[#7a6a20]">
                    Internal notes
                  </p>
                  {notes.map((n) => (
                    <p key={n.id} className="mt-2 text-sm text-[#5c4a10]">
                      {n.body}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            {error ? (
              <p className="px-6 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            <footer className="border-t border-[#e4e4e2] bg-white p-4">
              <div className="flex gap-2">
                <textarea
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  rows={2}
                  placeholder="Message the customer…"
                  className="flex-1 border border-[#e4e4e2] px-3 py-2 text-sm outline-none focus:border-[#1f4e3d]"
                  disabled={pending}
                />
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={pending}
                  className="border border-[#141414] bg-[#141414] px-4 text-sm text-white disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder="Internal note (staff only)…"
                  className="flex-1 border border-[#e4e4e2] px-3 py-2 text-sm outline-none focus:border-[#1f4e3d]"
                  disabled={pending}
                />
                <button
                  type="button"
                  onClick={() => void sendNote()}
                  disabled={pending}
                  className="border border-[#e4e4e2] px-4 text-sm"
                >
                  Add note
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
      {selected ? (
        <div className="mt-6 lg:col-span-2">
          <AiCopilotPanel conversationId={selected} />
        </div>
      ) : null}
    </div>
  );
}
