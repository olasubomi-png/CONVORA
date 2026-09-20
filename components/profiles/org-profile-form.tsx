"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProfileActionResult } from "@/app/actions/profiles";

type Props = {
  organizationId: string;
  action: (formData: FormData) => Promise<ProfileActionResult>;
  defaults?: {
    displayName?: string;
    description?: string | null;
    location?: string | null;
    serviceArea?: string | null;
    websiteUrl?: string | null;
    publicEmail?: string | null;
    publicPhone?: string | null;
    visibility?: "PUBLIC" | "PRIVATE";
  };
};

export function OrgProfileForm({ organizationId, action, defaults }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    formData.set("organizationId", organizationId);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) setError(result.error);
      else setSuccess(true);
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <Input
        name="displayName"
        label="Display name"
        defaultValue={defaults?.displayName}
        required
        disabled={pending}
      />
      <div className="space-y-1.5">
        <label htmlFor="description" className="block text-sm font-medium">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={defaults?.description ?? ""}
          disabled={pending}
          className="w-full border border-[#e4e4e2] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1f4e3d]"
        />
      </div>
      <Input name="location" label="Location" defaultValue={defaults?.location ?? ""} disabled={pending} />
      <Input name="serviceArea" label="Service area" defaultValue={defaults?.serviceArea ?? ""} disabled={pending} />
      <Input name="websiteUrl" label="Website URL" defaultValue={defaults?.websiteUrl ?? ""} disabled={pending} />
      <Input name="publicEmail" label="Public email" type="email" defaultValue={defaults?.publicEmail ?? ""} disabled={pending} />
      <Input name="publicPhone" label="Public phone" defaultValue={defaults?.publicPhone ?? ""} disabled={pending} />
      <div className="space-y-1.5">
        <label htmlFor="visibility" className="block text-sm font-medium">
          Visibility
        </label>
        <select
          id="visibility"
          name="visibility"
          defaultValue={defaults?.visibility ?? "PRIVATE"}
          disabled={pending}
          className="w-full border border-[#e4e4e2] bg-white px-3 py-2.5 text-sm"
        >
          <option value="PRIVATE">Private</option>
          <option value="PUBLIC">Public</option>
        </select>
      </div>
      {error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="border border-[#c8e0d4] bg-[#f0f7f3] px-3 py-2 text-sm text-[#1f4e3d]">
          Organization profile saved.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save organization profile"}
      </Button>
    </form>
  );
}
