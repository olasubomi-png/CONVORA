"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AuthFormProps = {
  mode: "register" | "login";
  action: (formData: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function AuthForm({ mode, action }: AuthFormProps) {
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
      {mode === "register" ? <Input name="fullName" label="Full name" autoComplete="name" required disabled={pending} /> : null}
      <Input name="email" type="email" label="Email" autoComplete="email" required disabled={pending} />
      <Input name="password" type="password" label="Password" autoComplete={mode === "register" ? "new-password" : "current-password"} required disabled={pending} minLength={mode === "register" ? 10 : undefined} />
      {error ? <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">{pending ? "Please wait…" : mode === "register" ? "Create account" : "Sign in"}</Button>
    </form>
  );
}
