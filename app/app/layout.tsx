import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { logoutAction } from "@/app/actions/auth";
import { Container } from "@/components/ui/container";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#f8f8f7]">
      <header className="border-b border-[#e4e4e2] bg-white">
        <Container className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/app" className="text-sm font-semibold tracking-[0.18em]">
              CONVORA
            </Link>
            <nav aria-label="Workspace">
              <ul className="flex gap-6 text-sm text-[#3f3f3f]">
                <li>
                  <Link href="/app" className="hover:text-[#141414]">
                    Workspace
                  </Link>
                </li>
                <li>
                  <Link href="/app/organization" className="hover:text-[#141414]">
                    Organization
                  </Link>
                </li>
                <li>
                  <Link href="/app/organization/profile" className="hover:text-[#141414]">
                    Org profile
                  </Link>
                </li>
                <li>
                  <Link href="/app/profile" className="hover:text-[#141414]">
                    Agent profile
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#5c5c5c]">{session.user.fullName}</span>
            <form action={logoutAction}>
              <button type="submit" className="text-[#3f3f3f] hover:text-[#141414]">
                Sign out
              </button>
            </form>
          </div>
        </Container>
      </header>
      <main>{children}</main>
    </div>
  );
}
