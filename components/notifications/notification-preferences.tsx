"use client";

import { useEffect, useState } from "react";

type Prefs = {
  inAppEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  soundEnabled: boolean;
  emailDigestSeconds: number;
};

export function NotificationPreferencesPanel({
  organizationId,
}: {
  organizationId: string;
}) {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/notifications/preferences?organizationId=${encodeURIComponent(organizationId)}`,
        );
        if (!res.ok) {
          setError("Could not load preferences.");
          return;
        }
        const data = await res.json();
        setPrefs(data.preferences);
      } catch {
        setError("Could not load preferences.");
      }
    })();
  }, [organizationId]);

  async function update(patch: Partial<Prefs>) {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...patch }),
      });
      if (!res.ok) {
        setError("Could not save preferences.");
        return;
      }
      const data = await res.json();
      if (data.preferences) {
        setPrefs({
          inAppEnabled: data.preferences.inAppEnabled,
          emailEnabled: data.preferences.emailEnabled,
          pushEnabled: data.preferences.pushEnabled,
          soundEnabled: data.preferences.soundEnabled,
          emailDigestSeconds: data.preferences.emailDigestSeconds,
        });
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
    <div className="space-y-4 rounded-2xl border border-[var(--cv-border)] bg-white p-4 sm:p-5">
      <div>
        <h2 className="text-base font-semibold">Notifications</h2>
        <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
          Choose how CONVORA alerts you about new customer messages.
        </p>
      </div>
      {(
        [
          ["inAppEnabled", "In-app notifications"],
          ["pushEnabled", "Browser push"],
          ["emailEnabled", "Email notifications"],
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
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--cv-fg-secondary)]">
          Email cooldown (seconds)
        </span>
        <p className="mb-2 text-xs text-[var(--cv-fg-muted)]">
          After the first alert, additional messages in the same conversation
          are batched into one email sent after this delay (30–3600). Not an
          immediate per-message email.
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
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {saving ? (
        <p className="text-xs text-[var(--cv-fg-muted)]">Saving…</p>
      ) : null}
    </div>
  );
}
