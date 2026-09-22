import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { loginAction } from "@/app/actions/auth";
import { getSession } from "@/lib/auth/session";

export const metadata = { title: "Sign in — CONVORA" };

export default async function LoginPage() {
  if (await getSession()) redirect("/app");
  return (
    <div className="flex min-h-screen flex-col bg-[var(--cv-bg)] lg:flex-row">
      <div className="hidden flex-1 flex-col justify-between bg-[var(--cv-sidebar)] p-10 text-white lg:flex">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--cv-accent)] text-sm font-bold">
            C
          </span>
          <span className="text-sm font-semibold tracking-[0.14em]">CONVORA</span>
        </Link>
        <div>
          <h1 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight">
            One workspace for every customer conversation.
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-400">
            Shared inbox, channels, AI assist, and team operations—securely
            scoped to your organization.
          </p>
        </div>
        <p className="text-xs text-slate-500">© CONVORA</p>
      </div>
      <div className="flex flex-1 flex-col justify-center px-6 py-12">
        <div className="mx-auto w-full max-w-md">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--cv-accent)] text-sm font-bold text-white">
              C
            </span>
            <span className="text-sm font-semibold tracking-[0.14em]">CONVORA</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--cv-fg)]">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-[var(--cv-fg-muted)]">
            Use the email and password for your CONVORA account.
          </p>
          <div className="mt-8 rounded-2xl border border-[var(--cv-border)] bg-white p-6 shadow-[var(--cv-shadow-sm)]">
            <AuthForm mode="login" action={loginAction} />
          </div>
          <p className="mt-6 text-center text-sm text-[var(--cv-fg-muted)]">
            No account?{" "}
            <Link
              href="/register"
              className="font-medium text-[var(--cv-accent)] hover:underline"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
