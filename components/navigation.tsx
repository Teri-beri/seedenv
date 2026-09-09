"use client";

import { Boxes, CreditCard, Flame, Gamepad2, LayoutDashboard, Medal, PlusCircle, ShieldCheck, WalletCards } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const testerItems = [
  { label: "Seed Missions", icon: Gamepad2 },
  { label: "Active Missions", icon: Flame },
  { label: "Leaderboard", icon: Medal },
  { label: "Vault", icon: WalletCards },
];

const developerItems = [
  { label: "SeedEnv Console", icon: LayoutDashboard },
  { label: "New Drop", icon: PlusCircle },
  { label: "Review Deck", icon: ShieldCheck },
  { label: "Asset Vault", icon: Boxes },
  { label: "Billing", icon: CreditCard },
];

export function RoleSwitcher() {
  const [role, setRole] = useState<"tester" | "developer">("tester");
  return (
    <div className="flex rounded-full border border-stroke bg-surface/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      {(["tester", "developer"] as const).map((nextRole) => (
        <button
          key={nextRole}
          className={`rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${role === nextRole ? "bg-aurum text-obsidian shadow-[0_10px_24px_rgba(245,158,11,0.18)]" : "text-muted hover:text-white"}`}
          onClick={() => setRole(nextRole)}
          type="button"
        >
          {nextRole}
        </button>
      ))}
    </div>
  );
}

export function DeveloperHeader() {
  return (
    <header className="sticky top-0 z-30 hidden border-b border-stroke bg-obsidian/88 px-8 py-4 backdrop-blur-xl lg:block">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative size-11 overflow-hidden rounded-2xl border border-stroke bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.32)]">
            <Image src="/seedenv-logo.svg" alt="SeedEnv" fill sizes="44px" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-aurum">SeedEnv</p>
            <h1 className="text-lg font-black">Developer Console</h1>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          {developerItems.map(({ label, icon: Icon }) => (
            <Button key={label} variant="ghost" size="sm">
              <Icon className="size-4" />
              {label}
            </Button>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function TesterBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stroke bg-obsidian/94 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {testerItems.map(({ label, icon: Icon }, index) => (
          <button key={label} className={`rounded-2xl px-2 py-2 text-[10px] font-semibold ${index === 0 ? "bg-royal text-white shadow-[0_10px_24px_rgba(109,40,217,0.22)]" : "text-muted"}`} type="button">
            <Icon className="mx-auto mb-1 size-4" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}