import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Container } from "@/components/ui/container";

const features = [
  {
    title: "Unified inbox",
    body: "WhatsApp, Web Chat, Facebook, and Instagram in one agent workspace.",
  },
  {
    title: "Customer intelligence",
    body: "Profiles, tags, notes, and history owned by the organization—not a single agent.",
  },
  {
    title: "AI copilot",
    body: "Summaries and suggested replies with human approval before anything is sent.",
  },
  {
    title: "Automations",
    body: "Deterministic rules for assignment, tags, priority, and internal notifications.",
  },
  {
    title: "Analytics",
    body: "Conversation volume, response patterns, and channel activity—tenant-scoped.",
  },
  {
    title: "Enterprise security",
    body: "Multi-tenant isolation, RBAC, encrypted credentials, and signed webhooks.",
  },
];

const channels = [
  { name: "Web Chat", desc: "Embed on your site" },
  { name: "WhatsApp", desc: "Cloud API" },
  { name: "Facebook", desc: "Messenger" },
  { name: "Instagram", desc: "Messaging" },
];

export default function HomePage() {
  return (
    <div id="top" className="bg-white">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-[var(--cv-border)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--cv-accent-soft),_transparent_55%)]" />
          <Container className="relative grid gap-12 py-16 md:grid-cols-12 md:py-24">
            <div className="md:col-span-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cv-accent)]">
                One inbox for every conversation
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-[var(--cv-fg)] md:text-5xl">
                Every customer conversation. One workspace.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-[var(--cv-fg-secondary)]">
                Connect WhatsApp, Facebook, Instagram and your website. Let customers
                message you where they already are, while you manage every
                conversation from CONVORA.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/register"
                  className="inline-flex items-center rounded-xl bg-[var(--cv-accent)] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[var(--cv-accent-hover)]"
                >
                  Start 90-day free trial
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-xl border border-[var(--cv-border)] bg-white px-5 py-2.5 text-sm font-medium text-[var(--cv-fg)] hover:bg-[var(--cv-surface-muted)]"
                >
                  Sign in
                </Link>
              </div>
              <p className="mt-4 text-xs text-[var(--cv-fg-muted)]">
                Premium-level access during trial · No card required to start
              </p>
            </div>

            {/* Product preview card */}
            <div className="md:col-span-6">
              <div className="overflow-hidden rounded-2xl border border-[var(--cv-border)] bg-white shadow-[var(--cv-shadow-md)]">
                <div className="flex items-center gap-2 border-b border-[var(--cv-border)] bg-[var(--cv-sidebar)] px-3 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                  <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
                  <span className="ml-2 text-[11px] text-slate-400">CONVORA Inbox</span>
                </div>
                <div className="grid grid-cols-12 text-left text-xs">
                  <div className="col-span-4 border-r border-[var(--cv-border)] bg-[var(--cv-surface-muted)] p-3">
                    <p className="font-semibold text-[var(--cv-fg)]">Conversations</p>
                    {[
                      ["Sarah Miller", "WhatsApp", "Open"],
                      ["John Davis", "Web Chat", "Open"],
                      ["Emily Wilson", "Instagram", "Pending"],
                    ].map(([name, ch, st]) => (
                      <div
                        key={name}
                        className="mt-2 rounded-lg border border-[var(--cv-border)] bg-white p-2"
                      >
                        <p className="font-medium text-[var(--cv-fg)]">{name}</p>
                        <p className="mt-0.5 text-[10px] text-[var(--cv-fg-muted)]">
                          {ch} · {st}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="col-span-8 p-3">
                    <div className="flex items-center justify-between border-b border-[var(--cv-border)] pb-2">
                      <div>
                        <p className="font-semibold text-[var(--cv-fg)]">Sarah Miller</p>
                        <p className="text-[10px] text-[var(--cv-fg-muted)]">WhatsApp · Open · High</p>
                      </div>
                      <span className="rounded-full bg-[var(--cv-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--cv-accent)]">
                        Assigned
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-[var(--cv-fg)]">
                        Hi, I need help with my order. It has been 5 days.
                      </div>
                      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-[var(--cv-accent)] px-3 py-2 text-white">
                        Happy to help—could you share your order number?
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      <div className="h-8 flex-1 rounded-lg border border-[var(--cv-border)] bg-[var(--cv-surface-muted)]" />
                      <div className="h-8 w-16 rounded-lg bg-[var(--cv-accent)]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Container>
        </section>

        <section id="product" className="border-b border-[var(--cv-border)] bg-[var(--cv-surface-muted)]">
          <Container className="py-16 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cv-accent)]">
              Product
            </p>
            <h2 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight text-[var(--cv-fg)]">
              Built for teams that outgrow fragmented inboxes.
            </h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <article
                  key={f.title}
                  className="rounded-2xl border border-[var(--cv-border)] bg-white p-5 shadow-[var(--cv-shadow-sm)]"
                >
                  <h3 className="text-sm font-semibold text-[var(--cv-fg)]">{f.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--cv-fg-secondary)]">
                    {f.body}
                  </p>
                </article>
              ))}
            </div>
          </Container>
        </section>

        <section id="channels" className="border-b border-[var(--cv-border)] bg-white">
          <Container className="py-16 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cv-accent)]">
              Channels
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              One engine. Every channel.
            </h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {channels.map((c) => (
                <div
                  key={c.name}
                  className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-surface-muted)] px-4 py-5"
                >
                  <p className="font-semibold text-[var(--cv-fg)]">{c.name}</p>
                  <p className="mt-1 text-xs text-[var(--cv-fg-muted)]">{c.desc}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>

        <section id="pricing" className="border-b border-[var(--cv-border)] bg-[var(--cv-surface-muted)]">
          <Container className="py-16 md:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cv-accent)]">
              Pricing
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Simple plans. Real entitlements.
            </h2>
            <p className="mt-2 max-w-lg text-sm text-[var(--cv-fg-muted)]">
              90-day free trial at Premium-level access. Yearly billing includes 20% off.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {[
                {
                  name: "Starter",
                  price: "₦6,799",
                  yearly: "₦65,270 / year",
                  items: [
                    "Web Chat & Facebook Messenger",
                    "AI with monthly allowance",
                    "Customers & shared inbox",
                  ],
                },
                {
                  name: "Premium",
                  price: "₦15,999",
                  yearly: "₦153,590 / year",
                  items: [
                    "WhatsApp & Instagram",
                    "Higher AI allowance",
                    "Automations & advanced analytics",
                  ],
                },
              ].map((plan) => (
                <article
                  key={plan.name}
                  className="flex flex-col rounded-2xl border border-[var(--cv-border)] bg-white p-6 shadow-[var(--cv-shadow-sm)]"
                >
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-3 text-3xl font-semibold tracking-tight">
                    {plan.price}
                    <span className="text-base font-normal text-[var(--cv-fg-muted)]">
                      {" "}
                      / month
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-[var(--cv-fg-muted)]">{plan.yearly}</p>
                  <ul className="mt-6 flex-1 space-y-2 text-sm text-[var(--cv-fg-secondary)]">
                    {plan.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="text-[var(--cv-accent)]">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/register"
                    className="mt-8 inline-flex items-center justify-center rounded-xl bg-[var(--cv-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
                  >
                    Get started
                  </Link>
                </article>
              ))}
            </div>
          </Container>
        </section>

        <section className="bg-[var(--cv-sidebar)]">
          <Container className="py-16 text-center md:py-20">
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              Put every customer conversation in one place.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-slate-400">
              Create an organization, connect a channel, and work from a shared inbox.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="inline-flex rounded-xl bg-[var(--cv-accent)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
              >
                Start free trial
              </Link>
              <Link
                href="/login"
                className="inline-flex rounded-xl border border-white/15 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5"
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
