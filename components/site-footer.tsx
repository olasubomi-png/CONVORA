import Link from "next/link";
import { Container } from "@/components/ui/container";

export function SiteFooter() {
  return (
    <footer className="border-t border-[#e5e5e5] bg-white">
      <Container className="flex flex-col gap-4 py-10 text-sm text-[#525252] md:flex-row md:items-center md:justify-between">
        <p className="font-semibold tracking-[0.2em] text-[#0a0a0a]">
          CONVORA
        </p>
        <p>
          The communication layer between organizations and the people they
          serve.
        </p>
        <div className="flex gap-4">
          <Link href="/login" className="hover:text-[#0a0a0a]">
            Sign in
          </Link>
          <Link href="/register" className="hover:text-[#0a0a0a]">
            Get started
          </Link>
        </div>
      </Container>
    </footer>
  );
}
