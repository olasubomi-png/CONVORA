import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getPrimaryMembership } from "@/lib/authz/primary-org";
import { logoutAction } from "@/app/actions/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const primary = await getPrimaryMembership(session.user.id);

  return (
    <AppShell
      userName={session.user.fullName}
      logoutAction={logoutAction}
      organizationId={primary?.organizationId ?? null}
    >
      {children}
    </AppShell>
  );
}
