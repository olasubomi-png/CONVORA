import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getPrimaryMembership } from "@/lib/authz/primary-org";
import { NotificationPreferencesPanel } from "@/components/notifications/notification-preferences";

export default async function NotificationSettingsPage() {
  const auth = await requireAuthenticatedUser();
  const primary = await getPrimaryMembership(auth.user.id);
  if (!primary) {
    redirect("/app/onboarding");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Notification settings
        </h1>
        <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">
          Control in-app, push, email, and sound alerts for{" "}
          {primary.organizationName}.
        </p>
      </div>
      <NotificationPreferencesPanel organizationId={primary.organizationId} />
    </div>
  );
}
