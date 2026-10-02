import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { registerAction } from "@/app/actions/auth";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Create account — CONVORA" };

export default async function RegisterPage() {
  if (await getSession()) redirect("/app");
  return (
    <div className="flex min-h-screen flex-col bg-[var(--cv-bg)] lg:flex-row">
      <div className="hidden flex-1 flex-col justify-between bg-[var(--cv-sidebar)] p-10 text-white lg:flex">
        <BrandLogo href="/" size={32} wordmarkClassName="text-white" />
        <div>
          <h1 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
            Start your 90-day free trial.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
            Premium-level access while you evaluate CONVORA for your team. No
            payment required to begin.
          </p>
        </div>
        <p className="text-xs text-slate-500">© CONVORA</p>
      </div>
      <div className="flex flex-1 flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <BrandLogo href="/" size={32} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--cv-fg)]">
            Create account
          </h1>
          <p className="mt-2 text-sm text-[var(--cv-fg-muted)]">
            Set up your CONVORA account to create an organization and invite
            your team.
          </p>
          <div className="mt-8 rounded-2xl border border-[var(--cv-border)] bg-white p-6 shadow-[var(--cv-shadow-sm)]">
            <AuthForm mode="register" action={registerAction} />
          </div>
          <p className="mt-6 text-center text-sm text-[var(--cv-fg-muted)]">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-[var(--cv-accent)] hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
