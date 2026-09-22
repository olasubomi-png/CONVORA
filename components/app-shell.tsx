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
  { href: "/app", label: "Dashboard", match: (p) => p === "/app" },
  {
    href: "/app/inbox",
    label: "Conversations",
    match: (p) => p.startsWith("/app/inbox"),
  },
  {
    href: "/app/customers",
    label: "Customers",
    match: (p) => p.startsWith("/app/customers"),
  },
  {
    href: "/app/team",
    label: "Teams",
    match: (p) => p.startsWith("/app/team"),
  },
  {
    href: "/app/automations",
    label: "Automations",
    match: (p) => p.startsWith("/app/automations"),
  },
  {
    href: "/app/analytics",
    label: "Analytics",
    match: (p) => p.startsWith("/app/analytics"),
  },
];

const channelNav: NavItem[] = [
  { href: "/app/settings/whatsapp", label: "WhatsApp" },
  { href: "/app/settings/web-chat", label: "Web Chat" },
  { href: "/app/settings/facebook", label: "Facebook" },
  { href: "/app/settings/instagram", label: "Instagram" },
];

const settingsNav: NavItem[] = [
  { href: "/app/organization", label: "Organization" },
  { href: "/app/organization/profile", label: "Org profile" },
  { href: "/app/profile", label: "Agent profile" },
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

      <nav
        className="flex-1 space-y-6 overflow-y-auto px-3 py-4"
        aria-label="Workspace"
      >
        <div className="space-y-0.5">
          {primaryNav.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={close}
            />
          ))}
        </div>

        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Channels
          </p>
          <div className="space-y-0.5">
            {channelNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={close}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Settings
          </p>
          <div className="space-y-0.5">
            {settingsNav.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                pathname={pathname}
                onNavigate={close}
              />
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

  return (
    <div className="flex min-h-screen bg-[var(--cv-bg)]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 bg-[var(--cv-sidebar)] lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-60">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <span className="truncate">Search conversations, customers…</span>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
