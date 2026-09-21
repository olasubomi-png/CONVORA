import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { registerAction } from "@/app/actions/auth";
import { getSession } from "@/lib/auth/session";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Register — CONVORA" };

export default async function RegisterPage() {
  if (await getSession()) redirect("/app");
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-[#e5e5e5] bg-white">
        <Container className="flex h-14 items-center justify-between">
          <Link href="/" className="text-sm font-semibold tracking-[0.18em]">CONVORA</Link>
          <Link href="/login" className="text-sm text-[#525252] hover:text-[#0a0a0a]">Sign in</Link>
        </Container>
      </header>
      <main className="py-16">
        <Container className="max-w-md">
          <h1 className="text-2xl tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm text-[#525252]">Phase 1 identity foundation. After registering you can create an organization.</p>
          <div className="mt-8 border border-[#e5e5e5] bg-white p-6">
            <AuthForm mode="register" action={registerAction} />
          </div>
        </Container>
      </main>
    </div>
  );
}
