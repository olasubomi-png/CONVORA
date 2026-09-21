import Link from "next/link";
import { Container } from "@/components/ui/container";

export function SiteFooter() {
  return (
    <footer className="border-t border-[#e4e4e2] bg-white">
      <Container className="flex flex-col gap-4 py-10 text-sm text-[#5c5c5c] md:flex-row md:items-center md:justify-between">
        <p className="font-semibold tracking-[0.18em] text-[#141414]">CONVORA</p>
        <p>
          The communication layer between organizations and the people they
          serve.
        </p>
        <div className="flex gap-4">
          <Link href="/login" className="hover:text-[#141414]">
            Sign in
          </Link>
          <Link href="/register" className="hover:text-[#141414]">
            Get started
          </Link>
        </div>
      </Container>
    </footer>
  );
}
