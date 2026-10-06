"use client";

import { UserRole } from "@prisma/client";
import { Boxes, BriefcaseBusiness, CreditCard, Flame, Gamepad2, LayoutDashboard, LoaderCircle, Medal, PlusCircle, Settings, ShieldCheck, Sprout, Trophy, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState, useTransition } from "react";
import { resolveTesterView } from "@/lib/tester-console";
import { activateAccountWorkspace, type WorkspaceRole } from "@/app/actions/accountActions";

const testerItems = [
  { label: "Discover", icon: Gamepad2, href: "/dashboard?view=discover", view: "discover" },
  { label: "My missions", icon: Flame, href: "/dashboard?view=missions", view: "missions" },
  { label: "Reputation", icon: Medal, href: "/dashboard?view=reputation", view: "reputation" },
  { label: "Leaderboard", icon: Trophy, href: "/dashboard?view=leaderboard", view: "leaderboard" },
  { label: "Settings", icon: UserRound, href: "/account", view: null },
];

const developerItems = [
  { label: "Console", view: "overview", icon: LayoutDashboard },
  { label: "New Drop", view: "new-drop", icon: PlusCircle },
  { label: "Submissions", view: "review-deck", icon: ShieldCheck },
  { label: "Artifacts", view: "asset-vault", icon: Boxes },
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

export function TesterBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const view = resolveTesterView(searchParams.get("view"), searchParams.get("claim"));
  useEffect(() => {
    if (pathname !== "/dashboard" || searchParams.has("view") || searchParams.has("claim")) return;
    const legacyViews: Record<string, string> = { "#tester-hub": "discover", "#active-missions": "missions", "#reputation": "reputation", "#leaderboard": "leaderboard" };
    const legacyView = legacyViews[window.location.hash];
    if (legacyView) router.replace(`/dashboard?view=${legacyView}`);
  }, [pathname, searchParams, router]);
  return (
    <nav aria-label="Tester app navigation" className="mobile-app-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-stroke bg-obsidian/94 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-0.5">
        {testerItems.map(({ label, icon: Icon, href, view: itemView }) => {
          const active = pathname === "/account" ? href === "/account" : pathname === "/dashboard" && itemView === view;
          return (
          <Link key={label} aria-current={active ? "page" : undefined} className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-2xl px-1 py-2 text-center text-[10px] font-semibold transition hover:bg-violet-500/10 hover:text-white ${active ? "bg-violet-500/15 text-violet-200" : "text-muted"}`} href={href}>
            <Icon className="mx-auto mb-1 size-4" />
            {label}
          </Link>
        ); })}
      </div>
    </nav>
  );
}

export function DeveloperBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "overview";
  const items = [...developerItems.map((item) => ({ label: item.view === "overview" ? "Home" : item.view === "new-drop" ? "New" : item.view === "review-deck" ? "Review" : item.view === "asset-vault" ? "Assets" : "Billing", href: `/console?view=${item.view}`, icon: item.icon, active: pathname === "/console" && view === item.view })), { label: "Settings", href: "/account", icon: Settings, active: pathname === "/account" }];
  return (
    <nav aria-label="Developer app navigation" className="mobile-app-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 px-1 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-6 gap-0.5">
        {items.map(({ label, href, icon: Icon, active }) => <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-semibold ${active ? "bg-zinc-800/80 text-white" : "text-zinc-400"}`}><Icon className="size-5" />{label}</Link>)}
      </div>
    </nav>
  );
}