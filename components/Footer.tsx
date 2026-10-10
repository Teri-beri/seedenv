import Link from "next/link";
import Image from "next/image";
import { StatusPill } from "@/components/StatusPill";

const columns = [
  { title: "Product", links: [["Live Cohorts", "/#cohorts"], ["Launch Circle", "/community"], ["Developer Platform", "/#engine"], ["Native Console (PWA)", "/#pwa"], ["Pricing Calculator", "/#pricing"]] },
  { title: "Developers", links: [["Find Beta Testers", "/guides/find-beta-testers"], ["TestFlight Testing Guide", "/guides/testflight-beta-testing"], ["Google Play Closed Testing", "/guides/google-play-closed-testing"], ["Testing Guides", "/guides"], ["Documentation", "/docs"], ["Blog", "/blog"], ["FAQ", "/faq"]] },
  { title: "Validators", links: [["Capability Tiers", "/#validators"], ["Payout Schedule (Stripe)", "/docs#payouts"], ["Guidelines & NDA", "/docs#guidelines"]] },
  { title: "Trust & Legal", links: [["Terms of Service", "/terms"], ["Privacy Policy", "/privacy"], ["Security Disclosure", "/security"], ["Operational Status", "/status"], ["Contact", "/contact"], ["TERIMUS LLC", "/terimus"]] },
];

export function Footer() {
  return <footer className="border-t border-zinc-800/80 bg-[#0A0D12] text-zinc-400">
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-12 sm:px-6 lg:px-8">
      <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-3 text-lg font-semibold text-zinc-100"><Image src="/seedenv-logo-v3.png" alt="" width={44} height={44} className="object-contain" />SeedEnv</Link>
      <div className="grid grid-cols-2 gap-x-5 gap-y-8 lg:grid-cols-4">{columns.map((column) => <nav key={column.title} aria-label={column.title}><h2 className="font-mono text-xs uppercase tracking-wider text-zinc-100">{column.title}</h2><ul className="mt-4 space-y-1">{column.links.map(([title, href]) => <li key={title}><Link href={href} className="inline-flex min-h-11 items-center text-sm leading-6 hover:text-white">{title}</Link></li>)}</ul></nav>)}</div>
      <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-white/10 pt-7">
        <p className="max-w-xl text-xs leading-6">&copy; 2026 SeedEnv. Operated by <Link href="/terimus" className="text-zinc-200 hover:text-white">TERIMUS LLC</Link>. All rights reserved.</p>
        <StatusPill />
      </div>
    </div>
  </footer>;
}