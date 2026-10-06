"use client";

import Image from "next/image";
import Link from "next/link";
import { UserDropdown, type DropdownAccount } from "@/components/user-dropdown";

export type ConsoleView = "overview" | "new-drop" | "review-deck" | "asset-vault" | "billing";

const tabs = [
  { label: "Console", href: "/console", view: "overview" },
  { label: "Review Deck", href: "/console?view=review-deck", view: "review-deck" },
  { label: "Asset Vault", href: "/console?view=asset-vault", view: "asset-vault" },
  { label: "Billing", href: "/console?view=billing", view: "billing" },
  { label: "Launch Circle", href: "/community", view: null },
] as const;

export function ConsoleHeader({ activeView, paymentsMode, account }: { activeView: ConsoleView; paymentsMode: "live" | "test"; account: DropdownAccount }) {
  return (
    <header className="mobile-app-header relative z-50! border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center">
          <Link href="/" aria-label="SeedEnv public site" className="flex min-w-0 items-center gap-2.5">
            <Image src="/seedenv-logo-v3.png" alt="" width={24} height={24} className="size-6 shrink-0 rounded-md" />
            <span className="hidden text-sm font-semibold tracking-tight text-zinc-100 sm:inline">SeedEnv</span>
          </Link>
          <span className="mx-2 hidden text-zinc-700 lg:inline">/</span>
          <h1 className="hidden truncate text-sm text-zinc-400 lg:block">Console</h1>
          {paymentsMode === "live"
            ? <span title="Stripe payments are in live mode" className="ml-3 shrink-0 whitespace-nowrap rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400">LIVE</span>
            : <span title="Stripe payments are in test mode" className="ml-3 shrink-0 whitespace-nowrap rounded border border-zinc-700 bg-zinc-800/60 px-2 py-0.5 font-mono text-[11px] text-zinc-400">TEST MODE</span>}
        </div>
        <nav aria-label="Developer console sections" className="hidden items-center gap-0.5 md:flex lg:gap-1">
          {tabs.map((tab) => {
            const active = tab.view === activeView;
            return (
              <Link
                key={tab.label}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap rounded-md px-2 py-1.5 text-xs lg:px-3 transition-colors ${active ? "bg-zinc-800/80 font-medium text-white" : "text-zinc-400 hover:text-zinc-200"}`}
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
          <UserDropdown account={account} />
        </div>
      </div>
    </header>
  );
}
