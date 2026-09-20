"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Installation = {
  id: string;
  name: string;
  publicKey: string;
  status: string;
  allowedOrigins: string[];
  config: Record<string, unknown>;
};

export function WebChatSettings({
  organizationId,
  installations: initial,
}: {
  organizationId: string;
  installations: Installation[];
}) {
  const [installations, setInstallations] = useState(initial);
  const [name, setName] = useState("Website chat");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/web-chat/installations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed");
        return;
      }
      setInstallations((prev) => [...prev, data.installation]);
      router.refresh();
    });
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-app.com";

  return (
    <div className="space-y-8">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-[#e4e4e2] px-3 py-2 text-sm"
          placeholder="Installation name"
        />
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="border border-[#141414] bg-[#141414] px-4 text-sm text-white disabled:opacity-50"
        >
          Create installation
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      {installations.length === 0 ? (
        <p className="text-sm text-[#5c5c5c]">No installations yet.</p>
      ) : (
        <ul className="space-y-6">
          {installations.map((i) => (
            <li key={i.id} className="border border-[#e4e4e2] bg-white p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-medium">{i.name}</h2>
                  <p className="mt-1 text-xs text-[#5c5c5c]">
                    Status: {i.status} · Key:{" "}
                    <code className="bg-[#f8f8f7] px-1">{i.publicKey}</code>
                  </p>
                </div>
              </div>
              <pre className="mt-4 overflow-x-auto bg-[#f8f8f7] p-3 text-xs">
{`<script
  src="${origin}/widget.js"
  data-convora-key="${i.publicKey}"
  async>
</script>`}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
