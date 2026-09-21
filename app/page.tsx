import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Container } from "@/components/ui/container";

const valueProps = [
  {
    title: "Unified inbox",
    body: "Every conversation from Web Chat, WhatsApp, Facebook Messenger, and Instagram lands in one agent workspace scoped to your organization.",
  },
  {
    title: "Multi-channel without chaos",
    body: "Provider adapters normalize inbound and outbound messages into a single conversation model—agents work threads, not channel silos.",
  },
  {
    title: "AI as a copilot",
    body: "Summaries, suggested replies, and context assistance stay human-approved. Agents remain in control of what customers see.",
  },
  {
    title: "Automation that stays safe",
    body: "Deterministic rules react to conversation and customer events—assignment, tags, priority, notes—without autonomous customer messaging.",
  },
  {
    title: "Customer intelligence",
    body: "Organization-owned customer records, attributes, tags, notes, and activity timelines that survive agent turnover.",
  },
  {
    title: "Security by design",
    body: "Multi-tenant isolation, role-based access, encrypted channel credentials, signed webhooks, and audit trails are enforced server-side.",
  },
];

const channels = [
  "Web Chat",
  "WhatsApp",
  "Facebook Messenger",
  "Instagram Messaging",
];

const plans = [
  {
    name: "Starter",
    price: "₦6,799",
    period: "/ month",
    yearly: "₦65,270 / year",
    items: [
      "Web Chat & Facebook Messenger",
      "AI with a monthly allowance",
      "Customers & conversations",
      "Shared inbox",
    ],
  },
  {
    name: "Premium",
    price: "₦15,999",
    period: "/ month",
    yearly: "₦153,590 / year",
    items: [
      "WhatsApp & Instagram included",
      "Higher AI allowance",
      "Automations",
      "Advanced analytics",
    ],
  },
];

export default function HomePage() {
  return (
    <div id="top">
      <SiteHeader />
      <main>
        <section className="border-b border-[#e4e4e2] bg-white">
          <Container className="grid gap-12 py-20 md:grid-cols-12 md:py-28">
            <div className="md:col-span-7">
              <p className="text-sm tracking-[0.16em] text-[#5c5c5c]">
                MULTI-CHANNEL CUSTOMER COMMUNICATION
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl leading-tight tracking-tight md:text-5xl">
                One inbox for every customer conversation.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-7 text-[#3f3f3f]">
                CONVORA is the communication layer between organizations and the
                people they serve—Web Chat, WhatsApp, Facebook Messenger, and
                Instagram in a single secure workspace for your team.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center bg-[#1f4e3d] px-4 py-2.5 text-sm text-white hover:bg-[#173b2e]"
                >
                  Start free trial
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center border border-[#141414] px-4 py-2.5 text-sm text-[#141414] hover:bg-[#f3f3f1]"
                >
                  Sign in
                </Link>
              </div>
              <p className="mt-4 text-sm text-[#5c5c5c]">
                7-day Premium-level trial. No payment required to start.
              </p>
            </div>
            <aside className="border border-[#e4e4e2] bg-[#f8f8f7] p-6 md:col-span-5">
              <h2 className="text-sm font-medium tracking-[0.12em] text-[#5c5c5c]">
                CHANNELS
              </h2>
              <ul className="mt-4 space-y-3 text-sm">
                {channels.map((c) => (
                  <li
                    key={c}
                    className="flex items-center justify-between border-t border-[#e4e4e2] pt-3 first:border-t-0 first:pt-0"
                  >
                    <span>{c}</span>
                    <span className="text-[#1f4e3d]">Supported</span>
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs leading-5 text-[#5c5c5c]">
                All channels feed the same conversation engine and shared agent
                inbox—tenant-isolated per organization.
              </p>
            </aside>
          </Container>
        </section>

        <section id="product" className="border-b border-[#e4e4e2] bg-[#f8f8f7]">
          <Container className="py-16 md:py-20">
            <p className="text-sm tracking-[0.16em] text-[#5c5c5c]">PRODUCT</p>
            <h2 className="mt-3 max-w-2xl text-3xl tracking-tight">
              Built for teams that outgrow fragmented inboxes.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#3f3f3f]">
              CONVORA keeps customers, conversations, agents, and audit history
              inside your organization—so when channels multiply, your
              operations stay coherent.
            </p>
            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {valueProps.map((item) => (
                <article
                  key={item.title}
                  className="border border-[#e4e4e2] bg-white p-5"
                >
                  <h3 className="text-base font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#3f3f3f]">
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
          </Container>
        </section>

        <section id="how-it-works" className="border-b border-[#e4e4e2] bg-white">
          <Container className="py-16 md:py-20">
            <p className="text-sm tracking-[0.16em] text-[#5c5c5c]">
              HOW IT WORKS
            </p>
            <h2 className="mt-3 text-3xl tracking-tight">
              From channel event to agent reply.
            </h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Connect channels",
                  body: "Install Web Chat on your site or connect WhatsApp, Facebook, and Instagram with encrypted credentials.",
                },
                {
                  step: "02",
                  title: "Conversations normalize",
                  body: "Inbound messages resolve to organization-owned customers and threads in the shared conversation engine.",
                },
                {
                  step: "03",
                  title: "Team works the inbox",
                  body: "Agents assign, reply, tag, automate, and use AI suggestions—with analytics on what actually happened.",
                },
              ].map((s) => (
                <li key={s.step} className="border border-[#e4e4e2] p-5">
                  <p className="text-xs tracking-[0.14em] text-[#5c5c5c]">
                    {s.step}
                  </p>
                  <h3 className="mt-2 text-base font-medium">{s.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#3f3f3f]">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        <section id="security" className="border-b border-[#e4e4e2] bg-[#f8f8f7]">
          <Container className="py-16 md:py-20">
            <p className="text-sm tracking-[0.16em] text-[#5c5c5c]">SECURITY</p>
            <h2 className="mt-3 max-w-2xl text-3xl tracking-tight">
              Multi-tenant isolation is not optional.
            </h2>
            <ul className="mt-8 grid gap-4 text-sm leading-6 text-[#3f3f3f] md:grid-cols-2">
              <li className="border border-[#e4e4e2] bg-white p-4">
                Organization-scoped data with server-side authorization and
                role-based access (Owner, Admin, Agent).
              </li>
              <li className="border border-[#e4e4e2] bg-white p-4">
                Channel credentials encrypted at rest; webhooks verified with
                provider signatures.
              </li>
              <li className="border border-[#e4e4e2] bg-white p-4">
                Opaque server-side sessions, HTTP-only cookies, and audit events
                for sensitive operations.
              </li>
              <li className="border border-[#e4e4e2] bg-white p-4">
                Billing entitlements enforced on the server—never client-side
                plan checks.
              </li>
            </ul>
          </Container>
        </section>

        <section id="pricing" className="border-b border-[#e4e4e2] bg-white">
          <Container className="py-16 md:py-20">
            <p className="text-sm tracking-[0.16em] text-[#5c5c5c]">PRICING</p>
            <h2 className="mt-3 text-3xl tracking-tight">
              Simple plans. Real entitlements.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#5c5c5c]">
              Start with a 7-day trial at Premium-level access. Yearly billing
              includes a 20% discount.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {plans.map((plan) => (
                <article
                  key={plan.name}
                  className="flex flex-col border border-[#e4e4e2] p-6"
                >
                  <h3 className="text-lg font-medium">{plan.name}</h3>
                  <p className="mt-3 text-3xl tracking-tight">
                    {plan.price}
                    <span className="text-base text-[#5c5c5c]">
                      {plan.period}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-[#5c5c5c]">{plan.yearly}</p>
                  <ul className="mt-6 flex-1 space-y-2 text-sm text-[#3f3f3f]">
                    {plan.items.map((item) => (
                      <li key={item}>· {item}</li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className="mt-8 inline-flex items-center justify-center bg-[#1a1a1a] px-4 py-2.5 text-sm text-white hover:bg-[#2a2a2a]"
                  >
                    Get started
                  </Link>
                </article>
              ))}
            </div>
          </Container>
        </section>

        <section className="bg-[#1f4e3d]">
          <Container className="py-16 text-center md:py-20">
            <h2 className="text-3xl tracking-tight text-white">
              Put every customer conversation in one place.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-white/80">
              Create an organization, invite your team, connect a channel, and
              start working from a shared inbox.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex items-center bg-white px-4 py-2.5 text-sm text-[#1f4e3d] hover:bg-[#f3f3f1]"
              >
                Start free trial
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center border border-white/40 px-4 py-2.5 text-sm text-white hover:bg-white/10"
              >
                Sign in
              </Link>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
