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
    <div className="min-h-screen bg-[#f8f8f7]">
      <header className="border-b border-[#e4e4e2] bg-white">
        <Container className="flex h-14 items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-[0.18em]">CONVORA</Link>
          <Link href="/register" className="text-sm text-[#3f3f3f] hover:text-[#141414]">Create account</Link>
        </Container>
      </header>
      <main className="py-16">
        <Container className="max-w-md">
          <h1 className="text-2xl tracking-tight">Sign in</h1>
          <p className="mt-2 text-sm text-[#5c5c5c]">Use the email and password for your CONVORA account.</p>
          <div className="mt-8 border border-[#e4e4e2] bg-white p-6">
            <AuthForm mode="login" action={loginAction} />
          </div>
        </Container>
      </main>
    </div>
  );
}
