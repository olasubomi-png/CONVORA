import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/authz/context";
import { getCustomerDetail } from "@/lib/customers/list";
import { listCustomerNotes } from "@/lib/customers/notes";
import { listCustomerTags } from "@/lib/customers/tags";
import { getCustomerAttributes } from "@/lib/customers/attributes";
import { getCustomerStats } from "@/lib/customers/stats";
import { listCustomerActivity } from "@/lib/customers/activity";
import { getDatabase } from "@/db";
import { conversations } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { Container } from "@/components/ui/container";
import { CustomerNoteForm } from "@/components/customers/customer-note-form";
import { CustomerEditForm } from "@/components/customers/customer-edit-form";
import { isAppError } from "@/lib/errors";

export const metadata = { title: "Customer — CONVORA" };

type Props = { params: Promise<{ customerId: string }> };

export default async function CustomerDetailPage({ params }: Props) {
  const auth = await requireAuthenticatedUser();
  const { customerId } = await params;

  let detail;
  try {
    detail = await getCustomerDetail(auth.user.id, customerId);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }

  const { customer } = detail;
  const [notes, tags, attributes, stats, activity, convs] = await Promise.all([
    listCustomerNotes(auth.user.id, customerId),
    listCustomerTags(auth.user.id, customerId),
    getCustomerAttributes(auth.user.id, customerId),
    getCustomerStats(auth.user.id, customerId),
    listCustomerActivity(auth.user.id, customerId, { limit: 20 }),
    getDatabase()
      .select({
        id: conversations.id,
        status: conversations.status,
        priority: conversations.priority,
        subject: conversations.subject,
        lastMessageAt: conversations.lastMessageAt,
      })
      .from(conversations)
      .where(eq(conversations.customerId, customerId))
      .orderBy(desc(conversations.createdAt))
      .limit(20),
  ]);

  return (
    <Container className="py-10">
      <Link href="/app/customers" className="text-sm text-[#5c5c5c] hover:underline">
        ← Customers
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-6 border-b border-[#e4e4e2] pb-8">
        <div>
          <h1 className="text-3xl tracking-tight">{customer.displayName}</h1>
          <p className="mt-2 text-sm text-[#5c5c5c]">
            {[customer.email, customer.phone, customer.companyName]
              .filter(Boolean)
              .join(" · ") || "No contact details"}
          </p>
          {customer.jobTitle || customer.location ? (
            <p className="mt-1 text-sm text-[#5c5c5c]">
              {[customer.jobTitle, customer.location].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-[#5c5c5c]">Conversations</dt>
            <dd className="text-lg">{stats.totalConversations}</dd>
          </div>
          <div>
            <dt className="text-[#5c5c5c]">Open</dt>
            <dd className="text-lg">{stats.openConversations}</dd>
          </div>
          <div>
            <dt className="text-[#5c5c5c]">Messages</dt>
            <dd className="text-lg">{stats.totalMessages}</dd>
          </div>
          <div>
            <dt className="text-[#5c5c5c]">Closed</dt>
            <dd className="text-lg">{stats.closedConversations}</dd>
          </div>
        </dl>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-12">
        <div className="space-y-10 lg:col-span-7">
          <section>
            <h2 className="text-lg tracking-tight">Profile</h2>
            <div className="mt-4 border border-[#e4e4e2] bg-white p-5">
              <CustomerEditForm customer={customer} />
            </div>
          </section>

          <section>
            <h2 className="text-lg tracking-tight">Conversations</h2>
            {convs.length === 0 ? (
              <p className="mt-3 text-sm text-[#5c5c5c]">No conversations yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[#e4e4e2] border border-[#e4e4e2] bg-white">
                {convs.map((c) => (
                  <li key={c.id} className="px-4 py-3 text-sm">
                    <Link
                      href={`/app/inbox?conversation=${c.id}`}
                      className="hover:underline"
                    >
                      {c.subject || "Conversation"}
                    </Link>
                    <p className="mt-1 text-xs text-[#5c5c5c]">
                      {c.status} · {c.priority}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg tracking-tight">Activity</h2>
            {activity.events.length === 0 ? (
              <p className="mt-3 text-sm text-[#5c5c5c]">No activity yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {activity.events.map((e) => (
                  <li
                    key={e.id}
                    className="border border-[#e4e4e2] bg-white px-4 py-2 text-sm"
                  >
                    <span className="text-[#5c5c5c]">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                    <span className="ml-3">{e.type}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-10 lg:col-span-5">
          <section>
            <h2 className="text-lg tracking-tight">Tags</h2>
            {tags.length === 0 ? (
              <p className="mt-3 text-sm text-[#5c5c5c]">No tags.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {tags.map((t) => (
                  <li
                    key={t.id}
                    className="border border-[#e4e4e2] px-2 py-0.5 text-xs"
                  >
                    {t.name}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="text-lg tracking-tight">Custom attributes</h2>
            {attributes.length === 0 ? (
              <p className="mt-3 text-sm text-[#5c5c5c]">No attributes defined.</p>
            ) : (
              <dl className="mt-3 space-y-2 text-sm">
                {attributes.map((a) => (
                  <div key={a.key} className="flex justify-between gap-4 border-b border-[#e4e4e2] py-2">
                    <dt className="text-[#5c5c5c]">{a.label}</dt>
                    <dd>{a.value == null ? "—" : String(a.value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section>
            <h2 className="text-lg tracking-tight">Internal notes</h2>
            <div className="mt-3 space-y-3">
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="border border-dashed border-[#c8b56a] bg-[#fffbeb] px-3 py-2 text-sm"
                >
                  {n.body}
                </div>
              ))}
              <CustomerNoteForm customerId={customerId} />
            </div>
          </section>
        </aside>
      </div>
    </Container>
  );
}
