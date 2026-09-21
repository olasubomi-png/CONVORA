import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { Container } from "@/components/ui/container";
import { VerifyPaymentClient } from "@/components/billing/verify-payment-client";
import Link from "next/link";

export const metadata = { title: "Confirming payment — CONVORA" };

export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string }>;
}) {
  const auth = await requireAuthenticatedUser();
  const params = await searchParams;
  const reference = params.reference?.trim() ?? "";
  const memberships = await getUserOrganizationContexts(auth.user.id);

  if (!memberships[0]) {
    return (
      <Container className="py-12">
        <p className="text-sm">No organization.</p>
      </Container>
    );
  }

  return (
    <Container className="py-10">
      <h1 className="text-2xl tracking-tight">Confirming payment</h1>
      <p className="mt-2 text-sm text-[#5c5c5c]">
        We are verifying your payment with Paystack. Do not close this page.
      </p>
      <div className="mt-6">
        <VerifyPaymentClient reference={reference} />
      </div>
      <Link
        href="/app/settings/billing"
        className="mt-8 inline-block text-sm text-[#1f4e3d]"
      >
        Back to billing
      </Link>
    </Container>
  );
}
