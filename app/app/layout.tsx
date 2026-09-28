import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getUserOrganizationContexts } from "@/lib/authz/context";
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

  const memberships = await getUserOrganizationContexts(session.user.id);
  const primary = memberships[0];

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
