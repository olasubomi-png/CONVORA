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
    <div className="min-h-screen bg-white">
      <header className="border-b border-[#e5e5e5] bg-white">
        <Container className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/app" className="text-sm font-semibold tracking-[0.2em]">
              CONVORA
            </Link>
            <nav aria-label="Workspace">
              <ul className="flex gap-6 text-sm text-[#525252]">
                <li>
                  <Link href="/app" className="hover:text-[#0a0a0a]">
                    Workspace
                  </Link>
                </li>
                <li>
                  <Link href="/app/inbox" className="hover:text-[#0a0a0a]">
                    Inbox
                  </Link>
                </li>
                <li>
                  <Link href="/app/team" className="hover:text-[#0a0a0a]">
                    Team
                  </Link>
                </li>
                <li>
                  <Link href="/app/automations" className="hover:text-[#0a0a0a]">
                    Automations
                  </Link>
                </li>
                <li>
                  <Link href="/app/customers" className="hover:text-[#0a0a0a]">
                    Customers
                  </Link>
                </li>
                <li>
                  <Link href="/app/analytics" className="hover:text-[#0a0a0a]">
                    Analytics
                  </Link>
                </li>
                <li>
                  <Link href="/app/settings/web-chat" className="hover:text-[#0a0a0a]">
                    Web Chat
                  </Link>
                </li>
                <li>
                  <Link href="/app/settings/whatsapp" className="hover:text-[#0a0a0a]">
                    WhatsApp
                  </Link>
                </li>
                <li>
                  <Link href="/app/organization" className="hover:text-[#0a0a0a]">
                    Organization
                  </Link>
                </li>
                <li>
                  <Link href="/app/organization/profile" className="hover:text-[#0a0a0a]">
                    Org profile
                  </Link>
                </li>
                <li>
                  <Link href="/app/profile" className="hover:text-[#0a0a0a]">
                    Agent profile
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#737373]">{session.user.fullName}</span>
            <form action={logoutAction}>
              <button type="submit" className="text-[#525252] hover:text-[#0a0a0a]">
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
