import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { completeOnboardingAction } from "@/app/actions/onboarding";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { Container } from "@/components/ui/container";

export const metadata = { title: "Create your CONVORA — CONVORA" };

export default async function OnboardingPage() {
  const auth = await requireAuthenticatedUser();
  const orgs = await getUserOrganizationContexts(auth.user.id);
  if (orgs.length > 0) {
    redirect("/app");
  }

  return (
    <Container className="max-w-lg py-10 lg:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cv-accent)]">
        Step 1 of 1
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--cv-fg)]">
        Create your CONVORA
      </h1>
      <p className="mt-2 text-sm leading-6 text-[var(--cv-fg-muted)]">
        This is your public presence. Customers can find you here—or message you
        on WhatsApp, Facebook, Instagram, or your website once you connect those
        channels. They do not need a CONVORA account to talk to you.
      </p>
      <div className="mt-8 rounded-2xl border border-[var(--cv-border)] bg-white p-6 shadow-[var(--cv-shadow-sm)]">
        <OnboardingForm
          action={completeOnboardingAction}
          defaultName={auth.user.fullName}
        />
      </div>
    </Container>
  );
}
