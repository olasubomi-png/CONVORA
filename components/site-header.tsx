import Link from "next/link";
import { Container } from "@/components/ui/container";
import { BrandLogo } from "@/components/brand-logo";

const links = [
  { href: "#product", label: "Product" },
  { href: "#channels", label: "Channels" },
  { href: "#pricing", label: "Pricing" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--cv-border)] bg-white/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <BrandLogo href="/#top" size={32} priority />
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm text-[var(--cv-fg-secondary)]">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="hover:text-[var(--cv-fg)]">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="text-sm text-[var(--cv-fg-secondary)] hover:text-[var(--cv-fg)]"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center rounded-xl bg-[var(--cv-accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--cv-accent-hover)]"
          >
            Get started
          </Link>
        </div>
      </Container>
    </header>
  );
}
