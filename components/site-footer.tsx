import { Container } from "@/components/ui/container";

export function SiteFooter() {
  return (
    <footer className="border-t border-[#e4e4e2] bg-white">
      <Container className="flex flex-col gap-4 py-10 text-sm text-[#5c5c5c] md:flex-row md:items-center md:justify-between">
        <p className="font-semibold tracking-[0.18em] text-[#141414]">CONVORA</p>
        <p>The communication layer between organizations and the people they serve.</p>
        <p>Phase 0 — engineering foundation</p>
      </Container>
    </footer>
  );
}
