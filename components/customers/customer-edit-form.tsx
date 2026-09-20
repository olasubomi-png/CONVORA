"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Customer = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  jobTitle: string | null;
  location: string | null;
  internalSummary: string | null;
};

export function CustomerEditForm({ customer }: { customer: Customer }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    const payload = {
      displayName: String(formData.get("displayName") ?? ""),
      email: String(formData.get("email") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      companyName: String(formData.get("companyName") ?? ""),
      jobTitle: String(formData.get("jobTitle") ?? ""),
      location: String(formData.get("location") ?? ""),
      internalSummary: String(formData.get("internalSummary") ?? ""),
    };
    startTransition(async () => {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Update failed");
        return;
      }
      setSuccess(true);
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="grid gap-3 sm:grid-cols-2">
      {(
        [
          ["displayName", "Name", customer.displayName],
          ["email", "Email", customer.email ?? ""],
          ["phone", "Phone", customer.phone ?? ""],
          ["companyName", "Company", customer.companyName ?? ""],
          ["jobTitle", "Job title", customer.jobTitle ?? ""],
          ["location", "Location", customer.location ?? ""],
        ] as const
      ).map(([name, label, value]) => (
        <label key={name} className="block text-sm">
          <span className="text-[#5c5c5c]">{label}</span>
          <input
            name={name}
            defaultValue={value}
            disabled={pending}
            className="mt-1 w-full border border-[#e4e4e2] px-3 py-2 outline-none focus:border-[#1f4e3d]"
          />
        </label>
      ))}
      <label className="block text-sm sm:col-span-2">
        <span className="text-[#5c5c5c]">Internal summary</span>
        <textarea
          name="internalSummary"
          defaultValue={customer.internalSummary ?? ""}
          rows={3}
          disabled={pending}
          className="mt-1 w-full border border-[#e4e4e2] px-3 py-2 outline-none focus:border-[#1f4e3d]"
        />
      </label>
      {error ? (
        <p className="text-sm text-red-700 sm:col-span-2" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-[#1f4e3d] sm:col-span-2">Saved.</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="border border-[#141414] bg-[#141414] px-4 py-2 text-sm text-white disabled:opacity-50 sm:col-span-2 sm:w-fit"
      >
        Save profile
      </button>
    </form>
  );
}
