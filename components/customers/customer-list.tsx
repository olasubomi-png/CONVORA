"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  createdAt: string | Date;
};

type Props = {
  organizationId: string;
  initial: Row[];
  initialQuery: string;
  nextCursor: string | null;
};

export function CustomerList({
  organizationId,
  initial,
  initialQuery,
  nextCursor: initialCursor,
}: Props) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState(initialQuery);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function search() {
    startTransition(() => {
      router.push(
        q.trim()
          ? `/app/customers?q=${encodeURIComponent(q.trim())}`
          : "/app/customers",
      );
    });
  }

  async function loadMore() {
    if (!cursor) return;
    setError(null);
    const url = new URL("/api/customers", window.location.origin);
    url.searchParams.set("organizationId", organizationId);
    url.searchParams.set("cursor", cursor);
    if (q.trim()) url.searchParams.set("q", q.trim());
    const res = await fetch(url);
    if (!res.ok) {
      setError("Failed to load more customers.");
      return;
    }
    const data = await res.json();
    setRows((prev) => [...prev, ...(data.customers ?? [])]);
    setCursor(data.nextCursor ?? null);
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search name, email, phone, company…"
          className="flex-1 border border-[#e4e4e2] px-3 py-2 text-sm outline-none focus:border-[#1f4e3d]"
        />
        <button
          type="button"
          onClick={search}
          disabled={pending}
          className="border border-[#141414] bg-[#141414] px-4 text-sm text-white"
        >
          Search
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="mt-10 text-sm text-[#5c5c5c]">No customers found.</p>
      ) : (
        <ul className="mt-6 divide-y divide-[#e4e4e2] border border-[#e4e4e2] bg-white">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/app/customers/${c.id}`}
                className="block px-4 py-3 hover:bg-[#f8f8f7]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{c.displayName}</span>
                  {c.companyName ? (
                    <span className="text-xs text-[#5c5c5c]">{c.companyName}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[#5c5c5c]">
                  {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {cursor ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          className="mt-4 text-sm text-[#1f4e3d] hover:underline"
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}
