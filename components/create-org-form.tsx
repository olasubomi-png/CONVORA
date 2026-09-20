"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { OrgActionResult } from "@/app/actions/organizations";

export function CreateOrgForm({ action }: { action: (formData: FormData) => Promise<OrgActionResult> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) setError(result.error);
    });
  }
  return (
    <form action={onSubmit} className="space-y-5">
      <Input name="name" label="Organization name" placeholder="Acme Properties" required disabled={pending} />
      <Input name="slug" label="Slug" placeholder="acme-properties" required disabled={pending} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="Lowercase letters, numbers, and hyphens only" />
      <p className="text-xs text-[#5c5c5c]">Slug is permanent. Reserved names such as app, login, and admin are not allowed.</p>
      {error ? <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create organization"}</Button>
    </form>
  );
}
