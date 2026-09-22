"use client";

type Installation = {
  id: string;
  displayName: string;
  status: string;
  publicConfig: Record<string, unknown>;
  provider: string;
  channel: string;
};

export function MetaConnectPanel({
  organizationId,
  provider,
  title,
  description,
  installations,
  metaConfigured,
  webhookUrl,
}: {
  organizationId: string;
  provider: "whatsapp_cloud" | "meta_messenger" | "meta_instagram";
  title: string;
  description: string;
  installations: Installation[];
  metaConfigured: boolean;
  webhookUrl: string;
}) {
  const active = installations.filter((i) => i.status === "ACTIVE");

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-[var(--cv-border)] bg-white p-5 text-sm shadow-[var(--cv-shadow-sm)]">
        <h2 className="font-semibold text-[var(--cv-fg)]">{title}</h2>
        <p className="mt-2 leading-6 text-[var(--cv-fg-secondary)]">{description}</p>

        {active.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--cv-fg-muted)]">
            Status:{" "}
            <span className="font-medium text-[var(--cv-fg)]">
              {metaConfigured ? "Not connected" : "Not configured"}
            </span>
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
          <h2 className="font-semibold text-[var(--cv-fg)]">Connect {title}</h2>
          {metaConfigured ? (
            <>
              <p className="mt-2 leading-6 text-[var(--cv-fg-secondary)]">
                Continue with Meta to authorize the account Meta requires. CONVORA
                stores credentials securely and routes messages to your inbox.
                You never paste API keys or webhook URLs.
              </p>
              <a
                href={`/api/channels/meta/oauth/start?organizationId=${encodeURIComponent(organizationId)}&provider=${encodeURIComponent(provider)}`}
                className="mt-4 inline-flex rounded-xl bg-[var(--cv-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
              >
                Authorize with Meta
              </a>
            </>
          ) : (
            <p className="mt-2 leading-6 text-[var(--cv-fg-secondary)]">
              Meta connection is not configured yet on this CONVORA deployment.
              Operators must set META_APP_ID and META_APP_SECRET before agents can
              connect.
            </p>
          )}
        </div>
      ) : null}

      <div className="rounded-2xl border border-dashed border-[var(--cv-border)] bg-[var(--cv-bg)] p-4 text-xs text-[var(--cv-fg-muted)]">
        <p className="font-medium text-[var(--cv-fg-secondary)]">Platform webhook</p>
        <code className="mt-1 block break-all">{webhookUrl}</code>
        <p className="mt-2">
          Managed by CONVORA. Shown for operator support only—not for agents to
          configure.
        </p>
      </div>
    </div>
  );
}
