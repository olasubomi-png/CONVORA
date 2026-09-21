"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Installation = {
  id: string;
  displayName: string;
  status: string;
  publicConfig: Record<string, unknown>;
  provider: string;
  channel: string;
};

export function InstagramSettings({
  organizationId,
  installations: initial,
  webhookUrl,
}: {
  organizationId: string;
  installations: Installation[];
  webhookUrl: string;
}) {
  const [installations, setInstallations] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [form, setForm] = useState({
    displayName: "Instagram Professional",
    pageAccessToken: "",
    appSecret: "",
    verifyToken: "",
    instagramAccountId: "",
    pageId: "",
  });

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/channels/instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          displayName: form.displayName,
          credentials: {
            pageAccessToken: form.pageAccessToken,
            appSecret: form.appSecret,
            verifyToken: form.verifyToken,
            instagramAccountId: form.instagramAccountId,
            pageId: form.pageId || undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to connect Instagram");
        return;
      }
      setInstallations((prev) => [...prev, data.installation]);
      setForm((f) => ({
        ...f,
        pageAccessToken: "",
        appSecret: "",
        verifyToken: "",
      }));
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <div className="border border-[#e4e4e2] bg-white p-5 text-sm">
        <h2 className="font-medium">Webhook URL</h2>
        <code className="mt-2 block break-all bg-[#f8f8f7] p-2 text-xs">
          {webhookUrl || "/api/webhooks/instagram"}
        </code>
        <p className="mt-2 text-xs text-[#5c5c5c]">
          Requires an Instagram professional account linked to a Facebook Page.
          Meta App Review may be required for production messaging.
        </p>
      </div>

      <div className="border border-[#e4e4e2] bg-white p-5">
        <h2 className="text-sm font-medium">Connected accounts</h2>
        {installations.length === 0 ? (
          <p className="mt-2 text-sm text-[#5c5c5c]">Not connected</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {installations.map((i) => (
              <li
                key={i.id}
                className="flex items-center justify-between border border-[#e4e4e2] px-3 py-2"
              >
                <span>
                  {i.displayName}
                  {typeof i.publicConfig.instagramAccountId === "string"
                    ? ` · IG ${i.publicConfig.instagramAccountId}`
                    : ""}
                </span>
                <span className="text-xs uppercase tracking-wide text-[#5c5c5c]">
                  {i.status === "ACTIVE" ? "Connected" : i.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border border-[#e4e4e2] bg-white p-5 space-y-3">
        <h2 className="text-sm font-medium">Connect Instagram</h2>
        {error ? (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        {(
          [
            ["displayName", "Display name"],
            ["instagramAccountId", "Instagram account ID"],
            ["pageId", "Linked Page ID (optional)"],
            ["pageAccessToken", "Page access token"],
            ["appSecret", "App secret"],
            ["verifyToken", "Webhook verify token"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="text-[#5c5c5c]">{label}</span>
            <input
              type={
                key.includes("Token") || key.includes("Secret")
                  ? "password"
                  : "text"
              }
              className="mt-1 w-full border border-[#e4e4e2] px-2 py-1.5"
              value={form[key]}
              onChange={(e) =>
                setForm((f) => ({ ...f, [key]: e.target.value }))
              }
              autoComplete="off"
            />
          </label>
        ))}
        <button
          type="button"
          disabled={pending}
          onClick={create}
          className="bg-[#1a1a1a] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Connecting…" : "Connect"}
        </button>
      </div>
    </div>
  );
}
