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
    <header className="border-b border-[#e4e4e2] bg-[#f8f8f7]">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/#top" className="text-sm font-semibold tracking-[0.18em]">
          CONVORA
        </Link>
        <nav aria-label="Primary">
          <ul className="hidden items-center gap-8 text-sm text-[#3f3f3f] md:flex">
            {links.map((link) => (
              <li key={link.href}>
                <a href={link.href} className="hover:text-[#141414]">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[#3f3f3f] hover:text-[#141414]">
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center border border-[#141414] bg-[#141414] px-3 py-2 text-sm text-white hover:bg-[#2a2a2a]"
          >
            Get started
          </Link>
        </div>
      </Container>
    </header>
  );
}
