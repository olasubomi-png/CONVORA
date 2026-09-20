import Link from "next/link";
import {
  requireAuthenticatedUser,
  getUserOrganizationContexts,
} from "@/lib/authz/context";
import { listCustomers } from "@/lib/customers/list";
import { Container } from "@/components/ui/container";
import { CustomerList } from "@/components/customers/customer-list";

export const metadata = { title: "Customers — CONVORA" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const auth = await requireAuthenticatedUser();
  const memberships = await getUserOrganizationContexts(auth.user.id);
  const primary = memberships[0];
  const params = await searchParams;

  if (!primary) {
    return (
      <Container className="py-12">
        <h1 className="text-2xl tracking-tight">Customers</h1>
        <p className="mt-2 text-sm text-[#5c5c5c]">
          Create an organization first.
        </p>
        <Link
          href="/app/organization"
          className="mt-4 inline-block text-sm text-[#1f4e3d] hover:underline"
        >
          Create organization
        </Link>
      </Container>
    );
  }

  const result = await listCustomers(auth.user.id, primary.organizationId, {
    q: params.q,
  });

  return (
    <Container className="py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-[#5c5c5c]">
            Organization-scoped contacts for {primary.organizationName}
          </p>
        </div>
      </div>
      <div className="mt-8">
        <CustomerList
          organizationId={primary.organizationId}
          initial={result.customers}
          initialQuery={params.q ?? ""}
          nextCursor={result.nextCursor}
        />
      </div>
    </Container>
  );
}
