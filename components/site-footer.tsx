import Link from "next/link";
import { Container } from "@/components/ui/container";

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--cv-border)] bg-white">
      <Container className="flex flex-col gap-4 py-10 text-sm text-[var(--cv-fg-muted)] md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--cv-accent)] text-xs font-bold text-white">
            C
          </span>
          <span className="font-semibold tracking-[0.14em] text-[var(--cv-fg)]">
            CONVORA
          </span>
        </div>
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
