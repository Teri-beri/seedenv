import { Activity, ArrowRight, BookOpen, GitBranch, Radar, ReceiptText, ServerCog, ShieldAlert, TicketPercent, type LucideIcon } from "lucide-react";
import Link from "next/link";

type DeveloperResource = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tag: string;
};

export const developerResources: ReadonlyArray<DeveloperResource> = [
  { title: "Telemetry Monitor", description: "Live validator nodes, device sessions, and incident streams for your active cohorts.", href: "/console/monitor", icon: Activity, tag: "LIVE" },
  { title: "SwarmForensics Bot Detector", description: "Paste comments or a post URL to flag coordinated bot swarms and export forensic receipts.", href: "/tools/swarm-detector", icon: Radar, tag: "TOOL" },
  { title: "Documentation", description: "Cohort setup, editing directions, reviews, payouts, and platform rules.", href: "/docs", icon: BookOpen, tag: "DOCS" },
  { title: "GitHub Integration", description: "Export tester submissions as GitHub issues with a scoped access token.", href: "/account?tab=security", icon: GitBranch, tag: "SETUP" },
  { title: "System Status", description: "Current platform health and the last 30 days of incident history.", href: "/status", icon: ServerCog, tag: "OPS" },
];

export const cohortRuleResources: ReadonlyArray<DeveloperResource> = [
  { title: "Cohort promo codes", description: "Create and manage private discount codes for cohort fees.", href: "/admin/promos", icon: TicketPercent, tag: "PROMOS" },
  { title: "Denied tester work", description: "Manually review denied tester proof against the assigned directions and evidence.", href: "/admin/proof-reviews", icon: ShieldAlert, tag: "APPEALS" },
  { title: "Refunds & payout repair", description: "Decide developer refund requests and safely retry tester payouts stuck in Stripe.", href: "/admin/refunds", icon: ReceiptText, tag: "BILLING" },
];

function ResourceGrid({ items, tone = "emerald" }: { items: ReadonlyArray<DeveloperResource>; tone?: "emerald" | "amber" }) {
  const accent = tone === "amber"
    ? { card: "hover:border-amber-500/30", icon: "border-amber-500/20 bg-amber-500/10 text-amber-300", open: "group-hover:text-amber-300", ring: "focus-visible:ring-amber-400" }
    : { card: "hover:border-emerald-500/30", icon: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300", open: "group-hover:text-emerald-300", ring: "focus-visible:ring-emerald-400" };
  return (
    <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ title, description, href, icon: Icon, tag }) => (
        <li key={href}>
          <Link href={href} className={`group flex h-full min-h-11 flex-col rounded-xl border border-white/[0.08] bg-[#171923]/80 p-4 transition hover:bg-[#171923] focus-visible:outline-none focus-visible:ring-2 ${accent.card} ${accent.ring}`}>
            <span className="flex items-center justify-between gap-3">
              <span className={`grid size-10 place-items-center rounded-lg border ${accent.icon}`}><Icon aria-hidden="true" className="size-5" /></span>
              <span className="rounded border border-white/[0.08] px-2 py-0.5 font-mono text-[10px] text-zinc-500">{tag}</span>
            </span>
            <span className="mt-4 block text-sm font-semibold text-zinc-100">{title}</span>
            <span className="mt-1 block flex-1 text-sm leading-6 text-zinc-400">{description}</span>
            <span className={`mt-4 inline-flex items-center gap-1 font-mono text-xs text-zinc-500 transition ${accent.open}`}>Open <ArrowRight aria-hidden="true" className="size-3.5" /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function DeveloperResources({ showCohortRules = false }: { showCohortRules?: boolean }) {
  return (
    <section aria-labelledby="developer-resources-heading" className="max-w-5xl">
      <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">Developer resources</p>
      <h2 id="developer-resources-heading" className="mt-2 text-xl font-semibold text-zinc-100">Tools & technical resources</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Diagnostics, integrations, and references that support your cohorts, kept here so the console stays focused on running tests.</p>
      <ResourceGrid items={developerResources} />
      {showCohortRules ? (
        <div aria-labelledby="cohort-rules-heading" role="region" className="mt-10 border-t border-white/[0.08] pt-8">
          <p className="font-mono text-xs uppercase tracking-wider text-amber-400/80">Operator only</p>
          <h3 id="cohort-rules-heading" className="mt-2 text-lg font-semibold text-zinc-100">Cohort rules</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Platform-wide pricing and review controls. Only SeedEnv operators can see this section.</p>
          <ResourceGrid items={cohortRuleResources} tone="amber" />
        </div>
      ) : null}
    </section>
  );
}
