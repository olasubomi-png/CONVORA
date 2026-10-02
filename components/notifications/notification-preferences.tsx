"use client";

import { useEffect, useState } from "react";

type Prefs = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  soundEnabled: boolean;
  emailDigestSeconds: number;
  whatsappEnabled: boolean;
  whatsappPhoneE164: string | null;
  whatsappDigestSeconds: number;
};

export function NotificationPreferencesPanel({
  organizationId,
}: {
  organizationId: string;
}) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [emailProviderConfigured, setEmailProviderConfigured] = useState<
    boolean | null
  >(null);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [whatsappConfigured, setWhatsappConfigured] = useState<boolean | null>(
    null,
  );

  useEffect(() => {
    void (async () => {
      try {
        const [res, statusRes] = await Promise.all([
          fetch(
            `/api/notifications/preferences?organizationId=${encodeURIComponent(organizationId)}`,
          ),
          fetch("/api/notifications/whatsapp-status"),
        ]);
        if (!res.ok) {
          setError("Could not load preferences.");
          return;
        }
        const data = await res.json();
        setPrefs(data.preferences);
        setAccountEmail(
          typeof data.accountEmail === "string" ? data.accountEmail : null,
        );
        setEmailProviderConfigured(
          typeof data.emailProviderConfigured === "boolean"
            ? data.emailProviderConfigured
            : null,
        );
        setPhoneDraft(data.preferences?.whatsappPhoneE164 ?? "");
        if (statusRes.ok) {
          const st = await statusRes.json();
          setWhatsappConfigured(Boolean(st.configured));
        }
      } catch {
        setError("Could not load preferences.");
      }
    })();
  }, [organizationId]);

  async function update(patch: Record<string, unknown>) {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...patch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : data.message || "Could not save preferences.",
        );
        return;
      }
      if (data.preferences) {
        setPrefs({
          inAppEnabled: data.preferences.inAppEnabled,
          emailEnabled: data.preferences.emailEnabled,
          pushEnabled: data.preferences.pushEnabled,
          soundEnabled: data.preferences.soundEnabled,
          emailDigestSeconds: data.preferences.emailDigestSeconds,
          whatsappEnabled: data.preferences.whatsappEnabled ?? false,
          whatsappPhoneE164: data.preferences.whatsappPhoneE164 ?? null,
          whatsappDigestSeconds: data.preferences.whatsappDigestSeconds ?? 120,
        });
        if (data.preferences.whatsappPhoneE164 != null) {
          setPhoneDraft(data.preferences.whatsappPhoneE164);
        }
      }
      if (typeof data.accountEmail === "string") {
        setAccountEmail(data.accountEmail);
      }
      if (typeof data.emailProviderConfigured === "boolean") {
        setEmailProviderConfigured(data.emailProviderConfigured);
      }
    } catch {
      setError("Could not save preferences.");
    } finally {
      setSaving(false);
    }
  }

  if (!prefs && !error) {
    return (
      <p className="text-sm text-[var(--cv-fg-muted)]">Loading preferences…</p>
    );
  }
  if (!prefs) {
    return <p className="text-sm text-red-700">{error}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-2xl border border-[var(--cv-border)] bg-white p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold">Email notifications</h2>
          <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
            Receive an email when customers send you new messages. Emails go to
            the address on your CONVORA account.
          </p>
        </div>
        {emailProviderConfigured === false ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Email delivery is not configured on this CONVORA instance yet. An
            administrator must set RESEND_API_KEY and EMAIL_FROM.
          </p>
        ) : null}
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Email notifications</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--cv-accent)]"
            checked={prefs.emailEnabled}
            disabled={saving}
            onChange={(e) => void update({ emailEnabled: e.target.checked })}
          />
        </label>
        <div className="rounded-xl bg-[var(--cv-surface-muted)] px-3 py-2.5 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--cv-fg-muted)]">
            Notifications will be sent to
          </p>
          <p className="mt-0.5 font-medium text-[var(--cv-fg)]">
            {accountEmail ?? "Your account email"}
          </p>
          <p className="mt-1 text-xs text-[var(--cv-fg-muted)]">
            This address comes from your login and cannot be changed here.
          </p>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--cv-fg-secondary)]">
            Email cooldown (seconds)
          </span>
          <p className="mb-2 text-xs text-[var(--cv-fg-muted)]">
            After the first alert, additional messages in the same conversation
            are batched into one email sent after this delay (30–3600).
          </p>
          <input
            type="number"
            min={30}
            max={3600}
            className="w-full rounded-xl border border-[var(--cv-border)] px-3 py-2"
            value={prefs.emailDigestSeconds}
            disabled={saving}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                emailDigestSeconds: Number(e.target.value) || 120,
              })
            }
            onBlur={() =>
              void update({ emailDigestSeconds: prefs.emailDigestSeconds })
            }
          />
        </label>
      </div>

      <div className="space-y-4 rounded-2xl border border-[var(--cv-border)] bg-white p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold">In-app & devices</h2>
          <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
            Choose how CONVORA alerts you inside the product.
          </p>
        </div>
        {(
          [
            ["inAppEnabled", "In-app notifications"],
            ["pushEnabled", "Browser push"],
            ["soundEnabled", "Notification sound"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span>{label}</span>
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--cv-accent)]"
              checked={prefs[key]}
              disabled={saving}
              onChange={(e) => void update({ [key]: e.target.checked })}
            />
          </label>
        ))}
      </div>

      <div className="space-y-4 rounded-2xl border border-[var(--cv-border)] bg-white p-4 sm:p-5">
        <div>
          <h2 className="text-base font-semibold">WhatsApp alerts</h2>
          <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
            Optional. Get a WhatsApp message on your phone when a customer
            writes in CONVORA.
          </p>
        </div>
        {whatsappConfigured === false ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            WhatsApp alerts are not fully configured on this CONVORA instance
            yet.
          </p>
        ) : null}
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>WhatsApp notifications</span>
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--cv-accent)]"
            checked={prefs.whatsappEnabled}
            disabled={saving}
            onChange={(e) => void update({ whatsappEnabled: e.target.checked })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--cv-fg-secondary)]">
            WhatsApp number (E.164)
          </span>
          <input
            type="tel"
            placeholder="+2348012345678"
            className="w-full rounded-xl border border-[var(--cv-border)] px-3 py-2"
            value={phoneDraft}
            disabled={saving}
            onChange={(e) => setPhoneDraft(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--cv-fg-secondary)]">
            WhatsApp cooldown (seconds)
          </span>
          <input
            type="number"
            min={30}
            max={3600}
            className="w-full rounded-xl border border-[var(--cv-border)] px-3 py-2"
            value={prefs.whatsappDigestSeconds}
            disabled={saving}
            onChange={(e) =>
              setPrefs({
                ...prefs,
                whatsappDigestSeconds: Number(e.target.value) || 120,
              })
            }
            onBlur={() =>
              void update({
                whatsappDigestSeconds: prefs.whatsappDigestSeconds,
              })
            }
          />
        </label>
        <button
          type="button"
          disabled={saving}
          className="rounded-xl bg-[var(--cv-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          onClick={() =>
            void update({
              whatsappPhoneE164: phoneDraft.trim() || null,
              whatsappEnabled: prefs.whatsappEnabled,
            })
          }
        >
          Save WhatsApp settings
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {saving ? (
        <p className="text-xs text-[var(--cv-fg-muted)]">Saving…</p>
      ) : null}
    </div>
  );
}
