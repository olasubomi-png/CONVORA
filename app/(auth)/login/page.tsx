import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { loginAction } from "@/app/actions/auth";
import { getSession } from "@/lib/auth/session";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Sign in — CONVORA" };

export default async function LoginPage() {
  if (await getSession()) redirect("/app");
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[#e5e5e5] bg-white">
        <Container className="flex h-14 items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-[0.18em]">CONVORA</Link>
          <Link href="/register" className="text-sm text-[#525252] hover:text-[#0a0a0a]">Create account</Link>
        </Container>
      </header>
      <main className="py-16">
        <Container className="max-w-md">
          <h1 className="text-2xl tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-[#525252]">Use the email and password for your CONVORA account.</p>
          <div className="mt-8 border border-[#e5e5e5] bg-white p-6">
            <AuthForm mode="login" action={loginAction} />
          </div>
        </Container>
      </main>
    </div>
  );
}
