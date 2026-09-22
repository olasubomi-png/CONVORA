"use client";

import { useState } from "react";

type Installation = {
  id: string;
  displayName: string;
  status: string;
  publicConfig: Record<string, unknown>;
  provider: string;
  channel: string;
};

/**
 * Agent-facing WhatsApp panel. Never displays tokens or webhook secrets.
 */
export function WhatsAppSettings({
  organizationId,
  installations: initial,
  webhookUrl,
  metaConnectAvailable = false,
}: {
  organizationId: string;
  installations: Installation[];
  webhookUrl: string;
  metaConnectAvailable?: boolean;
}) {
  const [installations] = useState(initial);
  const [error] = useState<string | null>(null);
  const active = installations.filter((i) => i.status === "ACTIVE");

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-[var(--cv-border)] bg-white p-5 text-sm shadow-[var(--cv-shadow-sm)]">
        <h2 className="font-semibold text-[var(--cv-fg)]">Connection status</h2>
        <p className="mt-2 leading-6 text-[var(--cv-fg-secondary)]">
          CONVORA owns webhook registration and message delivery. You only
          authorize the WhatsApp Business account Meta requires—never paste API
          keys or Graph URLs.
        </p>
        {active.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--cv-fg-muted)]">
            Status:{" "}
            <span className="font-medium text-[var(--cv-fg)]">Not connected</span>
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {active.map((i) => (
              <li
                key={i.id}
                className="rounded-xl border border-[var(--cv-border)] px-3 py-2"
              >
                <p className="font-medium text-[var(--cv-fg)]">{i.displayName}</p>
                <p className="text-xs text-[var(--cv-fg-muted)]">
                  Connected · {i.channel}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {active.length === 0 ? (
        <div className="rounded-2xl border border-[var(--cv-border)] bg-white p-5 text-sm shadow-[var(--cv-shadow-sm)]">
          <h2 className="font-semibold text-[var(--cv-fg)]">Connect WhatsApp</h2>
          {metaConnectAvailable ? (
            <>
              <p className="mt-2 leading-6 text-[var(--cv-fg-secondary)]">
                Continue with Meta to authorize your WhatsApp Business account.
                CONVORA stores credentials securely and routes messages to your
                inbox.
              </p>
              <a
                href={`/api/channels/whatsapp/oauth/start?organizationId=${encodeURIComponent(organizationId)}`}
                className="mt-4 inline-flex rounded-xl bg-[var(--cv-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
              >
                Authorize with Meta
              </a>
            </>
          ) : (
            <p className="mt-2 leading-6 text-[var(--cv-fg-secondary)]">
              WhatsApp authorization will be available once the CONVORA platform
              Meta application is configured by your operator. Agents never enter
              access tokens or webhook secrets.
            </p>
          )}
          {error ? (
            <p className="mt-3 text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-2xl border border-dashed border-[var(--cv-border)] bg-[var(--cv-bg)] p-4 text-xs text-[var(--cv-fg-muted)]">
        <p className="font-medium text-[var(--cv-fg-secondary)]">Platform webhook</p>
        <code className="mt-1 block break-all">
          {webhookUrl || "/api/webhooks/whatsapp"}
        </code>
        <p className="mt-2">
          Managed by CONVORA. Shown for support only—not required for agents to
          configure.
        </p>
      </div>
    </div>
  );
}
