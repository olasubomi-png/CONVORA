"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProfileActionResult } from "@/app/actions/profiles";
import { cn } from "@/lib/utils";

type ProfileDefaults = {
  publicUsername?: string;
  displayName?: string;
  professionalTitle?: string | null;
  bio?: string | null;
  location?: string | null;
  serviceArea?: string | null;
  yearsExperience?: number | null;
  visibility?: "PUBLIC" | "PRIVATE";
};

type Props = {
  organizationId: string;
  action: (formData: FormData) => Promise<ProfileActionResult>;
  onSuccess?: () => void;
  defaults?: ProfileDefaults;
  /** create = first-time essentials; edit = full form */
  mode?: "create" | "edit";
  /**
   * When set, the form does not render its own submit button so a parent
   * footer can submit via form={formId}.
   */
  formId?: string;
  hideSubmit?: boolean;
  submitLabel?: string;
  className?: string;
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cv-fg-muted,#5c5c5c)]">
      {children}
    </p>
  );
}

const fieldClass =
  "w-full rounded-xl border border-[var(--cv-border,#e4e4e2)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--cv-accent,#1f4e3d)] focus:ring-2 focus:ring-[var(--cv-accent,#1f4e3d)]/15 disabled:opacity-60";

export function AgentProfileForm({
  organizationId,
  action,
  onSuccess,
  defaults,
  mode = "edit",
  formId,
  hideSubmit = false,
  submitLabel,
  className,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const isCreate = mode === "create";

  function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    formData.set("organizationId", organizationId);
    if (isCreate && !formData.get("visibility")) {
      formData.set("visibility", "PRIVATE");
    }
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
      } else {
        setSuccess(true);
        if (onSuccess) onSuccess();
        else window.location.reload();
      }
    });
  }

  return (
    <form
      id={formId}
      action={onSubmit}
      className={cn("space-y-6", className)}
    >
      <section>
        <SectionLabel>Profile</SectionLabel>
        <div className="space-y-4">
          <Input
            name="displayName"
            label="Display name"
            defaultValue={defaults?.displayName}
            required
            disabled={pending}
          />
          <Input
            name="publicUsername"
            label="Public username"
            defaultValue={defaults?.publicUsername}
            required
            disabled={pending}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            autoComplete="username"
          />
          <p className="-mt-2 text-xs text-[var(--cv-fg-muted,#5c5c5c)]">
            Lowercase letters, numbers, and hyphens only.
          </p>
          <Input
            name="professionalTitle"
            label="Professional title"
            defaultValue={defaults?.professionalTitle ?? ""}
            disabled={pending}
            placeholder="e.g. Customer success lead"
          />
        </div>
      </section>

      <section>
        <SectionLabel>About</SectionLabel>
        <div className="space-y-1.5">
          <label htmlFor="bio" className="block text-sm font-medium">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={isCreate ? 3 : 4}
            defaultValue={defaults?.bio ?? ""}
            disabled={pending}
            placeholder="A short introduction for customers"
            className={fieldClass}
          />
        </div>
      </section>

      {!isCreate ? (
        <>
          <section>
            <SectionLabel>Service</SectionLabel>
            <div className="space-y-4">
              <Input
                name="location"
                label="Location"
                defaultValue={defaults?.location ?? ""}
                disabled={pending}
              />
              <Input
                name="serviceArea"
                label="Service area"
                defaultValue={defaults?.serviceArea ?? ""}
                disabled={pending}
              />
              <Input
                name="yearsExperience"
                label="Years of experience"
                type="number"
                min={0}
                max={80}
                defaultValue={
                  defaults?.yearsExperience != null
                    ? String(defaults.yearsExperience)
                    : ""
                }
                disabled={pending}
              />
            </div>
          </section>

          <section>
            <SectionLabel>Visibility</SectionLabel>
            <div className="space-y-1.5">
              <label htmlFor="visibility" className="block text-sm font-medium">
                Profile visibility
              </label>
              <select
                id="visibility"
                name="visibility"
                defaultValue={defaults?.visibility ?? "PRIVATE"}
                disabled={pending}
                className={fieldClass}
              >
                <option value="PRIVATE">Private — only you can see it</option>
                <option value="PUBLIC">Public — shareable agent page</option>
              </select>
            </div>
          </section>
        </>
      ) : null}

      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success && !onSuccess ? (
        <p className="rounded-xl border border-[#c8e0d4] bg-[#f0f7f3] px-3 py-2 text-sm text-[#1f4e3d]">
          Profile saved.
        </p>
      ) : null}

      {!hideSubmit ? (
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending
            ? isCreate
              ? "Creating…"
              : "Saving…"
            : (submitLabel ?? (isCreate ? "Create profile" : "Save changes"))}
        </Button>
      ) : null}

      {/* Hidden pending state for parent footers */}
    </form>
  );
}

/** Client-side avatar upload using /api/profiles/avatar */
export function AvatarUploadButton({
  profileId,
  currentUrl,
  onUpdated,
}: {
  profileId: string;
  currentUrl?: string | null;
  onUpdated?: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("profileId", profileId);
      fd.set("avatar", file);
      const res = await fetch("/api/profiles/avatar", { method: "POST", body: fd });
      const data = (await res.json()) as {
        avatarUrl?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Upload failed");
        return;
      }
      onUpdated?.(data.avatarUrl ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {preview || currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview || currentUrl || ""}
          alt="Avatar preview"
          className="h-20 w-20 rounded-2xl border border-[var(--cv-border)] object-cover"
        />
      ) : null}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        capture="user"
        disabled={busy}
        onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        className="block text-sm"
      />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
