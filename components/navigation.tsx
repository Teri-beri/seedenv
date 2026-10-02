"use client";

import { UserRole } from "@prisma/client";
import { Boxes, BriefcaseBusiness, CreditCard, Flame, Gamepad2, LayoutDashboard, LoaderCircle, Medal, PlusCircle, Settings, ShieldCheck, Sprout, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useTransition } from "react";
import { activateAccountWorkspace, type WorkspaceRole } from "@/app/actions/accountActions";
import { Button } from "@/components/ui/button";

const testerItems = [
  { label: "Seed Missions", icon: Gamepad2 },
  { label: "Active Missions", icon: Flame },
  { label: "Leaderboard", icon: Medal },
  { label: "Account", icon: UserRound },
];

const developerItems = [
  { label: "Console", view: "overview", icon: LayoutDashboard },
  { label: "New Drop", view: "new-drop", icon: PlusCircle },
  { label: "Review Deck", view: "review-deck", icon: ShieldCheck },
  { label: "Asset Vault", view: "asset-vault", icon: Boxes },
  { label: "Billing", view: "billing", icon: CreditCard },
];

export function RoleSwitcher({ activeRole, testerWorkspaceEnabled, developerWorkspaceEnabled }: { activeRole: UserRole; testerWorkspaceEnabled: boolean; developerWorkspaceEnabled: boolean }) {
  const router = useRouter();
  const { update } = useSession();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function activate(role: WorkspaceRole) {
    if (role === activeRole || isPending) return;
    setMessage("");
    startTransition(async () => {
      const result = await activateAccountWorkspace(role);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      await update();
      router.push(role === UserRole.DEVELOPER ? "/console" : "/dashboard");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex rounded-full border border-stroke bg-surface/80 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      {([{ role: UserRole.TESTER, enabled: testerWorkspaceEnabled, icon: Sprout }, { role: UserRole.DEVELOPER, enabled: developerWorkspaceEnabled, icon: BriefcaseBusiness }] as const).map(({ role, enabled, icon: Icon }) => (
        <button
          aria-pressed={activeRole === role}
          disabled={isPending || activeRole === role}
          key={role}
          className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] transition disabled:cursor-default ${activeRole === role ? "bg-aurum text-obsidian shadow-[0_10px_24px_rgba(245,158,11,0.18)]" : "text-muted hover:text-white"}`}
          onClick={() => activate(role)}
          type="button"
        >
          {isPending && activeRole !== role ? <LoaderCircle className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />}
          {activeRole === role ? role === UserRole.TESTER ? "Tester" : "Developer" : enabled ? role === UserRole.TESTER ? "Switch to Tester" : "Switch to Developer" : role === UserRole.TESTER ? "Add Tester" : "Add Developer"}
        </button>
      ))}
      </div>
      {message ? <p className="mt-2 text-xs text-rose-300" role="alert">{message}</p> : null}
    </div>
  );
}

export function DeveloperHeader({ activeView }: { activeView: "overview" | "new-drop" | "review-deck" | "asset-vault" | "billing" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-stroke bg-obsidian/95 px-3 py-3 backdrop-blur-xl sm:px-6 lg:px-8 lg:py-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex shrink-0 items-center gap-3">
          <div className="relative size-11 overflow-hidden rounded-2xl border border-stroke bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.32)]">
            <Image src="/seedenv-logo-v2.png" alt="SeedEnv" fill sizes="44px" className="scale-125 object-cover" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-aurum">SeedEnv</p>
            <h1 className="text-lg font-black">Developer Console</h1>
          </div>
        </div>
        <nav aria-label="Developer console sections" className="-mx-3 flex max-w-full items-center gap-1 overflow-x-auto px-3 pb-1 sm:mx-0 sm:gap-2 sm:px-0 sm:pb-0">
          {developerItems.map(({ label, view, icon: Icon }) => (
            <Button className={`shrink-0 whitespace-nowrap ${activeView === view ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : ""}`} key={label} variant="ghost" size="sm" asChild>
              <Link aria-current={activeView === view ? "page" : undefined} href={`/console?view=${view}`}>
                <Icon className="size-4" />
                {label}
              </Link>
            </Button>
          ))}
          <Button className="shrink-0 whitespace-nowrap" variant="ghost" size="sm" asChild>
            <Link href="/account">
              <Settings className="size-4" /> Account
            </Link>
          </Button>
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
          <Link key={label} className={`rounded-2xl px-2 py-2 text-center text-[10px] font-semibold ${index === 0 ? "bg-royal text-white shadow-[0_10px_24px_rgba(109,40,217,0.22)]" : "text-muted"}`} href={label === "Account" ? "/account" : "/dashboard"}>
            <Icon className="mx-auto mb-1 size-4" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}