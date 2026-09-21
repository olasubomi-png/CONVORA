import Link from "next/link";
import { Container } from "@/components/ui/container";

const links = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#security", label: "Security" },
  { href: "#pricing", label: "Pricing" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-[#e5e5e5] bg-white">
      <Container className="flex h-16 items-center justify-between">
        <Link
          href="/#top"
          className="text-sm font-semibold tracking-[0.2em] text-[#0a0a0a]"
        >
          CONVORA
        </Link>
        <nav aria-label="Primary">
          <ul className="hidden items-center gap-8 text-sm text-[#525252] md:flex">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="hover:text-[#0a0a0a]">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-[#525252] hover:text-[#0a0a0a]"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center bg-[#0a0a0a] px-3 py-2 text-sm text-white hover:bg-[#262626]"
          >
            Get started
          </Link>
        </div>
      </Container>
    </header>
  );
}
