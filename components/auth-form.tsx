"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/app/actions/auth";

type AuthFormProps = {
  mode: "register" | "login";
  action: (formData: FormData) => Promise<ActionResult>;
};

export function AuthForm({ mode, action }: AuthFormProps) {
  const [state, formAction, pending] = useActionState(
    async (
      _prev: ActionResult | null,
      formData: FormData,
    ): Promise<ActionResult | null> => {
      return action(formData);
    },
    null,
  );

  return (
    <form action={formAction} className="space-y-5">
      {mode === "register" ? (
        <Input
          name="fullName"
          label="Full name"
          autoComplete="name"
          required
          disabled={pending}
        />
      ) : null}
      <Input
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        disabled={pending}
      />
      <Input
        name="password"
        type="password"
        label="Password"
        autoComplete={
          mode === "register" ? "new-password" : "current-password"
        }
        required
        disabled={pending}
        minLength={mode === "register" ? 10 : undefined}
      />
      {state && !state.ok ? (
        <p
          className="border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending
          ? "Please wait…"
          : mode === "register"
            ? "Create account"
            : "Sign in"}
      </Button>
    </form>
  );
}
