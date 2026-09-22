"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { OnboardingResult } from "@/app/actions/onboarding";

export function OnboardingForm({
  action,
  defaultName,
}: {
  action: (formData: FormData) => Promise<OnboardingResult>;
  defaultName?: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: OnboardingResult | null, formData: FormData) => {
      return action(formData);
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      <Input
        name="displayName"
        label="Business or agent name"
        defaultValue={defaultName}
        required
        disabled={pending}
        placeholder="e.g. Ola Autos"
      />
      <div>
        <Input
          name="slug"
          label="CONVORA username"
          required
          disabled={pending}
          placeholder="ola-autos"
          pattern="[a-z0-9-]{2,48}"
        />
        <p className="mt-1.5 text-xs text-[var(--cv-fg-muted)]">
          Your public page will be at /org/your-username
        </p>
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="description"
          className="block text-sm font-medium text-[var(--cv-fg)]"
        >
          Short description{" "}
          <span className="text-[var(--cv-fg-muted)]">(optional)</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          disabled={pending}
          placeholder="What do you offer?"
          className="w-full rounded-xl border border-[var(--cv-border)] bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-[var(--cv-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--cv-accent-ring)]"
        />
      </div>
      {state && !state.ok ? (
        <p
          className="rounded-xl bg-[var(--cv-danger-soft)] px-3 py-2 text-sm text-[var(--cv-danger)]"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create my CONVORA"}
      </Button>
    </form>
  );
}
