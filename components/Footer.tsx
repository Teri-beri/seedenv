import Link from "next/link";
import Image from "next/image";

const columns = [
  { title: "Product", links: [["Live Cohorts", "/?view=cohorts"], ["Launch Circle", "/?view=circle"], ["Developer Platform", "/?view=developers"], ["Native Console (PWA)", "/?view=mobile"], ["Pricing Calculator", "/?view=pricing"]] },
  { title: "Developers", links: [["TestFlight Setup Guide", "/docs#testflight"], ["Telemetry Format", "/docs#telemetry"], ["Escrow & Fees", "/docs#escrow"], ["Documentation", "/docs"]] },
  { title: "Validators", links: [["Capability Tiers", "/?view=validators"], ["Payout Schedule (Stripe)", "/docs#payouts"], ["Guidelines & NDA", "/docs#guidelines"]] },
  { title: "Trust & Legal", links: [["Terms of Service", "/terms"], ["Privacy Policy", "/privacy"], ["Security Disclosure", "/security"], ["Operational Status", "https://status.seedenv.com"]] },
];

export function Footer() {
  const state = process.env.NEXT_PUBLIC_SEEDENV_STATUS;
  const rawUptime = process.env.NEXT_PUBLIC_SEEDENV_UPTIME_PERCENT;
  const uptime = rawUptime ? Number(rawUptime) : NaN;
  const verified = Number.isFinite(uptime) && uptime >= 0 && uptime <= 100;
  const operational = state === "operational";
  const label = operational ? "System Operational" : state === "degraded" ? "Degraded Service" : state === "maintenance" ? "Maintenance" : "Status Unverified";
  return <footer className="border-t border-white/10 bg-[#0F1117] text-zinc-400">
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-3 text-lg font-semibold text-zinc-100"><Image src="/seedenv-logo-v3.png" alt="" width={44} height={44} className="object-contain" />SeedEnv</Link>
      <div className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">{columns.map((column) => <nav key={column.title} aria-label={column.title}><h2 className="font-mono text-xs uppercase tracking-wider text-zinc-100">{column.title}</h2><ul className="mt-4 space-y-1">{column.links.map(([title, href]) => <li key={title}><Link href={href} className="inline-flex min-h-11 items-center text-sm leading-6 hover:text-white">{title}</Link></li>)}</ul></nav>)}</div>
      <div className="mt-9 flex flex-wrap items-center justify-between gap-5 border-t border-white/10 pt-7">
        <p className="max-w-xl text-xs leading-6">&copy; 2026 SeedEnv. Operated by <Link href="/terimus" className="text-zinc-200 hover:text-white">TERIMUS LLC</Link>. All rights reserved.</p>
        <a href="https://status.seedenv.com" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/10 px-3 font-mono text-xs"><span className={`size-1.5 rounded-full ${operational ? "bg-emerald-400" : "bg-zinc-500"}`} aria-hidden="true" />[{label}{verified ? ` ${uptime.toFixed(2)}%` : " / uptime unverified"}]</a>
      </div>
    </div>
  </footer>;
}