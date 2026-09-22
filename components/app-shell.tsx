"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  match?: (path: string) => boolean;
};

const primaryNav: NavItem[] = [
  { href: "/app", label: "Home", match: (p) => p === "/app" },
  {
    href: "/app/inbox",
    label: "Inbox",
    match: (p) => p.startsWith("/app/inbox"),
  },
  {
    href: "/app/customers",
    label: "Customers",
    match: (p) => p.startsWith("/app/customers"),
  },
  {
    href: "/app/my-convora",
    label: "My CONVORA",
    match: (p) => p.startsWith("/app/my-convora") || p.startsWith("/app/organization/profile"),
  },
  {
    href: "/app/channels",
    label: "Channels",
    match: (p) =>
      p.startsWith("/app/channels") || p.startsWith("/app/settings/"),
  },
];

const moreNav: NavItem[] = [
  { href: "/app/team", label: "Team" },
  { href: "/app/automations", label: "Automations" },
  { href: "/app/analytics", label: "Analytics" },
  { href: "/app/profile", label: "Agent profile" },
  { href: "/app/organization", label: "Organization" },
  { href: "/app/settings/billing", label: "Billing" },
];

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = item.match
    ? item.match(pathname)
    : pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active
          ? "bg-[var(--cv-sidebar-active)] font-medium text-[var(--cv-sidebar-text-active)]"
          : "text-[var(--cv-sidebar-text)] hover:bg-[var(--cv-sidebar-hover)] hover:text-white",
      )}
    >
      {item.label}
    </Link>
  );
}

export function AppShell({
  children,
  userName,
  logoutAction,
}: {
  children: React.ReactNode;
  userName: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const hideChrome =
    pathname.startsWith("/app/onboarding");

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 border-b border-white/5 px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--cv-accent)] text-sm font-bold text-white">
          C
        </span>
        <span className="text-sm font-semibold tracking-[0.14em] text-white">
          CONVORA
        </span>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Workspace">
        <div className="space-y-0.5">
          {primaryNav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} onNavigate={close} />
          ))}
        </div>
        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            More
          </p>
          <div className="space-y-0.5">
            {moreNav.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} onNavigate={close} />
            ))}
          </div>
        </div>
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-lg px-2 py-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-white">
            {userName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <p className="text-[11px] text-slate-400">Agent</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 transition-colors hover:bg-[var(--cv-sidebar-hover)] hover:text-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  if (hideChrome) {
    return (
      <div className="min-h-screen bg-[var(--cv-bg)]">
        <header className="border-b border-[var(--cv-border)] bg-white px-4 py-3">
          <Link href="/app" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--cv-accent)] text-sm font-bold text-white">
              C
            </span>
            <span className="text-sm font-semibold tracking-[0.14em]">CONVORA</span>
          </Link>
        </header>
        <main>{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--cv-bg)]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-[var(--cv-sidebar)] lg:block">
        {sidebar}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50"
            aria-label="Close menu"
            onClick={close}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-[var(--cv-sidebar)] shadow-xl">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-screen flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-[var(--cv-border)] bg-white/90 px-4 backdrop-blur lg:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-[var(--cv-fg-secondary)] hover:bg-[var(--cv-surface-muted)] lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-surface-muted)] px-3 py-1.5 text-sm text-[var(--cv-fg-muted)]">
            <span className="truncate">Search conversations, customers…</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
