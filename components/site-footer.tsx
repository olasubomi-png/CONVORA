import Link from "next/link";
import { Container } from "@/components/ui/container";
import { BrandLogo } from "@/components/brand-logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--cv-border)] bg-white">
      <Container className="flex flex-col gap-4 py-10 text-sm text-[var(--cv-fg-muted)] md:flex-row md:items-center md:justify-between">
        <BrandLogo href="/" size={28} />
        <p>The communication layer between organizations and the people they serve.</p>
        <div className="flex gap-4">
          <Link href="/login" className="hover:text-[var(--cv-fg)]">
            Sign in
          </Link>
          <Link href="/register" className="hover:text-[var(--cv-fg)]">
            Get started
          </Link>
        </div>
      </Container>
    </footer>
  );
}
