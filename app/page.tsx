import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Container } from "@/components/ui/container";

const capabilities = [
  {
    title: "Shared inbox",
    body: "One working surface for conversations that arrive from different channels.",
  },
  {
    title: "Organization isolation",
    body: "Every operational record belongs to an organization. Access is decided on the server.",
  },
  {
    title: "Channel adapters",
    body: "Provider-specific integrations stay outside the conversation domain.",
  },
  {
    title: "Assignment",
    body: "Conversations can be owned by agents without binding the core model to a single network.",
  },
  {
    title: "Customer context",
    body: "People an organization serves are first-class, independent of the channel they used.",
  },
  {
    title: "Operational discipline",
    body: "Validation, typed errors, and audit-ready boundaries are part of the foundation.",
  },
];

const steps = [
  {
    title: "Connect a channel",
    body: "An adapter receives provider events and maps them into CONVORA conversation events.",
  },
  {
    title: "Normalize the thread",
    body: "The conversation engine stores customers, conversations, and messages in one model.",
  },
  {
    title: "Work the inbox",
    body: "Agents respond from a shared workspace scoped to their organization.",
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
                COMMUNICATION INFRASTRUCTURE
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl leading-tight tracking-tight md:text-5xl">
                The communication layer between organizations and the people they serve.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-7 text-[#3f3f3f]">
                CONVORA is being built as production software for teams that need one
                operational system for conversations—not a collection of disconnected inboxes.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#contact"
                  className="inline-flex items-center bg-[#1f4e3d] px-4 py-2.5 text-sm text-white hover:bg-[#173b2e]"
                >
                  Request access
                </a>
                <a
                  href="#product"
                  className="inline-flex items-center border border-[#141414] px-4 py-2.5 text-sm text-[#141414] hover:bg-[#f3f3f1]"
                >
                  Read the product brief
                </a>
              </div>
            </div>
            <aside className="border border-[#e4e4e2] bg-[#f8f8f7] p-6 md:col-span-5">
              <h2 className="text-sm font-medium tracking-[0.12em] text-[#5c5c5c]">
                CURRENT STATUS
              </h2>
              <p className="mt-3 text-2xl">Phase 0</p>
              <p className="mt-3 text-sm leading-6 text-[#3f3f3f]">
                Engineering foundation only. Authentication, channels, conversations, and
                billing are not available yet.
              </p>
              <dl className="mt-6 space-y-3 text-sm">
                <div className="flex justify-between border-t border-[#e4e4e2] pt-3">
                  <dt className="text-[#5c5c5c]">Application</dt>
                  <dd>Next.js App Router</dd>
                </div>
                <div className="flex justify-between border-t border-[#e4e4e2] pt-3">
                  <dt className="text-[#5c5c5c]">Data layer</dt>
                  <dd>Drizzle / PostgreSQL</dd>
                </div>
                <div className="flex justify-between border-t border-[#e4e4e2] pt-3">
                  <dt className="text-[#5c5c5c]">Tenancy</dt>
                  <dd>Documented, not implemented</dd>
                </div>
              </dl>
            </aside>
          </Container>
        </section>

        <section id="product" className="border-b border-[#e4e4e2]">
          <Container className="grid gap-10 py-20 md:grid-cols-12">
            <div className="md:col-span-4">
              <h2 className="text-3xl tracking-tight">What CONVORA is</h2>
            </div>
            <div className="space-y-5 text-base leading-7 text-[#3f3f3f] md:col-span-8">
              <p>
                Organizations already speak with customers across WhatsApp, email, social
                networks, websites, and SMS. Those conversations usually live in the tools
                that delivered them.
              </p>
              <p>
                CONVORA treats the conversation as the system of record. Channels become
                adapters. Agents work from one inbox. The organization remains the security
                boundary.
              </p>
              <p>
                This page describes the product direction. It does not present unfinished
                software as a working dashboard.
              </p>
            </div>
          </Container>
        </section>

        <section id="capabilities" className="border-b border-[#e4e4e2] bg-white">
          <Container className="py-20">
            <h2 className="text-3xl tracking-tight">Core capabilities</h2>
            <p className="mt-3 max-w-2xl text-[#3f3f3f]">
              Planned product surfaces. None of these are live in Phase 0.
            </p>
            <ul className="mt-12 grid gap-px bg-[#e4e4e2] sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((item) => (
                <li key={item.title} className="bg-white p-6">
                  <h3 className="text-lg">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#3f3f3f]">{item.body}</p>
                </li>
              ))}
            </ul>
          </Container>
        </section>

        <section id="how-it-works" className="border-b border-[#e4e4e2]">
          <Container className="py-20">
            <h2 className="text-3xl tracking-tight">How it works</h2>
            <ol className="mt-12 grid gap-8 md:grid-cols-3">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <p className="font-mono text-sm text-[#5c5c5c]">0{index + 1}</p>
                  <h3 className="mt-3 text-xl">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-[#3f3f3f]">{step.body}</p>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        <section id="security" className="border-b border-[#e4e4e2] bg-white">
          <Container className="grid gap-10 py-20 md:grid-cols-12">
            <div className="md:col-span-4">
              <h2 className="text-3xl tracking-tight">Security and tenancy</h2>
            </div>
            <div className="space-y-5 text-base leading-7 text-[#3f3f3f] md:col-span-8">
              <p>
                CONVORA will be multi-tenant. Organization-owned data is never selected by
                trusting an identifier sent from the browser.
              </p>
              <p>
                The intended control flow is request, authenticated user, organization
                membership, then authorized resource. Channel credentials, customer records,
                and conversation history stay inside that boundary.
              </p>
              <p>
                Principles for authorization, secret handling, sessions, CSRF, rate limits,
                audit logging, and safe errors are documented in the repository. They are
                constraints for later phases, not claims about a finished control plane.
              </p>
            </div>
          </Container>
        </section>

        <section id="contact" className="bg-[#141414] text-white">
          <Container className="py-20">
            <h2 className="text-3xl tracking-tight">Start with the foundation</h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#c8c8c8]">
              CONVORA is in Phase 0. There is no public signup. If you are building with
              this repository, use the development documentation to run the application
              locally.
            </p>
            <a
              href="https://github.com/olasubomi-png/CONVORA"
              className="mt-8 inline-flex items-center border border-white px-4 py-2.5 text-sm hover:bg-white hover:text-[#141414]"
            >
              View the repository
            </a>
          </Container>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
