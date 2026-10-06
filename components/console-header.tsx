"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

export type ConsoleView = "overview" | "new-drop" | "review-deck" | "asset-vault" | "billing";

const tabs = [
  { label: "Console", href: "/console", view: "overview" },
  { label: "Review Deck", href: "/console?view=review-deck", view: "review-deck" },
  { label: "Asset Vault", href: "/console?view=asset-vault", view: "asset-vault" },
  { label: "Billing", href: "/console?view=billing", view: "billing" },
  { label: "Settings", href: "/account", view: null },
] as const;

const accountLinks = [
  { label: "Account settings", href: "/account" },
  { label: "Launch Circle", href: "/community" },
  { label: "Tester applications", href: "/applications" },
  { label: "Clippers", href: "/clippers" },
  { label: "Public site", href: "/" },
] as const;

export function ConsoleHeader({ activeView, paymentsMode, account }: { activeView: ConsoleView; paymentsMode: "live" | "test"; account: { username: string; avatarUrl: string | null } }) {
  return (
    <header className="mobile-app-header border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center">
          <Link href="/" aria-label="SeedEnv public site" className="flex min-w-0 items-center gap-2.5">
            <Image src="/seedenv-logo-v3.png" alt="" width={24} height={24} className="size-6 shrink-0 rounded-md" />
            <span className="hidden text-sm font-semibold tracking-tight text-zinc-100 sm:inline">SeedEnv</span>
          </Link>
          <span className="mx-2 hidden text-zinc-700 lg:inline">/</span>
          <h1 className="hidden truncate text-sm text-zinc-400 lg:block">Developer Console</h1>
          {paymentsMode === "live"
            ? <span title="Stripe payments are in live mode" className="ml-3 shrink-0 whitespace-nowrap rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400">LIVE</span>
            : <span title="Stripe payments are in test mode" className="ml-3 shrink-0 whitespace-nowrap rounded border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 font-mono text-[11px] text-zinc-400">TEST MODE</span>}
        </div>
        <nav aria-label="Developer console sections" className="hidden items-center gap-1 md:flex">
          {tabs.map((tab) => {
            const active = tab.view === activeView;
            return (
              <Link
                key={tab.label}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${active ? "bg-zinc-800/80 font-medium text-white" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/console?view=new-drop"
            aria-current={activeView === "new-drop" ? "page" : undefined}
            className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition-all hover:bg-zinc-200"
          >
            + Deploy Cohort
          </Link>
          <AccountMenu account={account} />
        </div>
      </div>
    </header>
  );
}

function AccountMenu({ account }: { account: { username: string; avatarUrl: string | null } }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const initial = account.username.trim().charAt(0).toUpperCase() || "?";
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid size-8 place-items-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 bg-cover bg-center text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-600"
        style={account.avatarUrl ? { backgroundImage: `url(${JSON.stringify(account.avatarUrl)})` } : undefined}
      >
        {account.avatarUrl ? null : initial}
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 py-1 shadow-xl shadow-black/40">
          <p className="truncate border-b border-zinc-800 px-3 py-2 font-mono text-xs text-zinc-500">@{account.username}</p>
          {accountLinks.map((item) => (
            <Link key={item.href} role="menuitem" href={item.href} onClick={() => setOpen(false)} className="block px-3 py-2 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white">
              {item.label}
            </Link>
          ))}
          <button type="button" role="menuitem" onClick={() => signOut({ callbackUrl: "/auth/signin" })} className="block w-full border-t border-zinc-800 px-3 py-2 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white">
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
