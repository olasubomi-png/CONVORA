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

export function WhatsAppSettings({
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
    displayName: "WhatsApp Business",
    accessToken: "",
    appSecret: "",
    verifyToken: "",
    phoneNumberId: "",
  });

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/channels/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          displayName: form.displayName,
          credentials: {
            accessToken: form.accessToken,
            appSecret: form.appSecret,
            verifyToken: form.verifyToken,
            phoneNumberId: form.phoneNumberId,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to connect WhatsApp");
        return;
      }
      setInstallations((prev) => [...prev, data.installation]);
      setForm((f) => ({
        ...f,
        accessToken: "",
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
          {webhookUrl || "/api/webhooks/whatsapp"}
        </code>
        <p className="mt-2 text-xs text-[#5c5c5c]">
          Configure this URL in Meta Developer Console. Verify token is never shown
          after save.
        </p>
      </div>

      {installations.map((i) => {
        const phone = (i.publicConfig as { phoneNumberId?: string })
          .phoneNumberId;
        return (
          <div key={i.id} className="border border-[#e4e4e2] bg-white p-5">
            <h2 className="font-medium">{i.displayName}</h2>
            <p className="mt-1 text-xs text-[#5c5c5c]">
              Status: {i.status}
              {phone ? ` · Phone number ID: ${phone}` : ""}
            </p>
          </div>
        );
      })}

      <div className="border border-[#e4e4e2] bg-white p-5">
        <h2 className="font-medium">Connect WhatsApp</h2>
        <div className="mt-4 grid gap-3 text-sm">
          {(
            [
              ["displayName", "Display name"],
              ["phoneNumberId", "Phone number ID"],
              ["accessToken", "Access token"],
              ["appSecret", "App secret"],
              ["verifyToken", "Webhook verify token"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block">
              <span className="text-xs text-[#5c5c5c]">{label}</span>
              <input
                type={
                  key === "accessToken" || key === "appSecret"
                    ? "password"
                    : "text"
                }
                className="mt-1 w-full border border-[#e4e4e2] px-3 py-2"
                value={form[key]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [key]: e.target.value }))
                }
                autoComplete="off"
              />
            </label>
          ))}
        </div>
        {error ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          onClick={create}
          disabled={pending}
          className="mt-4 border border-[#141414] bg-[#141414] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Save connection
        </button>
      </div>
    </div>
  );
}
