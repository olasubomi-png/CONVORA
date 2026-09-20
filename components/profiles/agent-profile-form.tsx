"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProfileActionResult } from "@/app/actions/profiles";

type Props = {
  organizationId: string;
  action: (formData: FormData) => Promise<ProfileActionResult>;
  defaults?: {
    publicUsername?: string;
    displayName?: string;
    professionalTitle?: string | null;
    bio?: string | null;
    location?: string | null;
    serviceArea?: string | null;
    yearsExperience?: number | null;
    visibility?: "PUBLIC" | "PRIVATE";
  };
};

export function AgentProfileForm({ organizationId, action, defaults }: Props) {
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
        name="publicUsername"
        label="Public username"
        defaultValue={defaults?.publicUsername}
        required
        disabled={pending}
        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
      />
      <Input
        name="displayName"
        label="Display name"
        defaultValue={defaults?.displayName}
        required
        disabled={pending}
      />
      <Input
        name="professionalTitle"
        label="Professional title"
        defaultValue={defaults?.professionalTitle ?? ""}
        disabled={pending}
      />
      <div className="space-y-1.5">
        <label htmlFor="bio" className="block text-sm font-medium">
          Bio
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={defaults?.bio ?? ""}
          disabled={pending}
          className="w-full border border-[#e4e4e2] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1f4e3d]"
        />
      </div>
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
        defaultValue={defaults?.yearsExperience ?? ""}
        disabled={pending}
      />
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
          Profile saved.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
