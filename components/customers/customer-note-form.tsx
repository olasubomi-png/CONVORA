"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function CustomerNoteForm({ customerId }: { customerId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit() {
    if (!body.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/customers/${customerId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to add note");
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Add internal note…"
        className="w-full border border-[#e4e4e2] px-3 py-2 text-sm outline-none focus:border-[#1f4e3d]"
        disabled={pending}
      />
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="border border-[#141414] bg-[#141414] px-3 py-1.5 text-sm text-white disabled:opacity-50"
      >
        Add note
      </button>
    </div>
  );
}
