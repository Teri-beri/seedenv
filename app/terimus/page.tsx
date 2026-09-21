import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Check, Globe2, Layers3, ShieldCheck, Sparkles } from "lucide-react";
import { AnalyticsTracker } from "@/components/analytics-tracker";

export const metadata: Metadata = {
  title: "TERIMUS LLC | Product Infrastructure for Ambitious Launches",
  description: "TERIMUS LLC builds focused digital products and infrastructure for trusted communities, validation, and growth.",
  alternates: { canonical: "/terimus" },
};

const capabilities = [
  { icon: Layers3, title: "Product systems", text: "Thoughtful software foundations designed to move from first prototype to durable product." },
  { icon: ShieldCheck, title: "Trust infrastructure", text: "Identity, moderation, payments, and human verification shaped around real-world accountability." },
  { icon: BarChart3, title: "Measured growth", text: "Clear signals from real users, so teams can make confident decisions before and after launch." },
];

export default function TerimusPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#090A0F] text-white">
      <AnalyticsTracker />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(245,158,11,0.15),transparent_27%),radial-gradient(circle_at_88%_12%,rgba(109,40,217,0.2),transparent_30%),linear-gradient(180deg,#090A0F_0%,#11131B_55%,#090A0F_100%)]" aria-hidden="true" />
      <header className="relative z-10 border-b border-white/10 bg-[#090A0F]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/terimus" className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/10 text-amber-300"><Sparkles className="size-5" /></span><span><span className="block font-mono text-xs font-bold uppercase tracking-[0.28em] text-amber-400">TERIMUS LLC</span><span className="block text-xs text-zinc-500">Product infrastructure studio</span></span></Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-400"><a className="hidden hover:text-white sm:block" href="#work">What we build</a><a className="hidden hover:text-white sm:block" href="#contact">Connect</a><Link className="rounded-lg border border-white/15 px-3 py-2 font-semibold text-white hover:border-amber-400/50" href="/">Visit SeedEnv</Link></nav>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-end gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:py-36">
        <div><p className="font-mono text-xs font-bold uppercase tracking-[0.32em] text-amber-400">Independent software company · Est. 2026</p><h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.94] tracking-tight text-white sm:text-7xl">Build the product people can trust.</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-400 sm:text-xl">TERIMUS LLC creates focused digital products and the infrastructure behind credible launches, from human validation to measurable community growth.</p><div className="mt-9 flex flex-wrap gap-3"><a className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3.5 font-bold text-[#090A0F] shadow-[0_16px_40px_rgba(245,158,11,0.2)] hover:bg-amber-400" href="#work">Explore our work <ArrowRight className="size-4" /></a><Link className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3.5 font-bold text-zinc-200 hover:border-amber-400/40 hover:text-white" href="/">Open SeedEnv</Link></div></div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/30 backdrop-blur-md sm:p-7"><div className="flex items-center justify-between border-b border-white/10 pb-5"><span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Operating principles</span><Globe2 className="size-5 text-amber-400" /></div><div className="space-y-5 pt-5"><Principle number="01" title="Useful over noisy" /><Principle number="02" title="Evidence over assumptions" /><Principle number="03" title="People over vanity metrics" /></div></div>
      </section>

      <section className="relative z-10 border-y border-white/10 bg-[#0E1017]/55" id="work"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24"><div className="max-w-2xl"><p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-amber-400">A small company with a wide lens</p><h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Infrastructure that makes ambition more accountable.</h2><p className="mt-5 text-base leading-7 text-zinc-400">We bring product thinking, community design, and operational rigor together so a launch is not just visible, but understood.</p></div><div className="mt-10 grid gap-4 md:grid-cols-3">{capabilities.map(({ icon: Icon, title, text }) => <article className="rounded-2xl border border-white/10 bg-zinc-950/45 p-5 transition hover:-translate-y-1 hover:border-amber-400/30" key={title}><Icon className="size-6 text-amber-400" /><h3 className="mt-6 text-xl font-bold">{title}</h3><p className="mt-3 text-sm leading-6 text-zinc-400">{text}</p></article>)}</div></div></section>

      <section className="relative z-10 mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24" id="contact"><div className="rounded-3xl border border-amber-400/20 bg-gradient-to-br from-amber-500/10 via-white/[0.03] to-violet-500/10 p-6 sm:p-10"><div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-end"><div><p className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-amber-400">Our current platform</p><h2 className="mt-4 max-w-2xl text-3xl font-black sm:text-4xl">SeedEnv turns early feedback into launch confidence.</h2><p className="mt-4 max-w-2xl text-zinc-400">A developer-first validation platform for real testers, structured proof, device telemetry, and transparent campaign economics.</p></div><Link className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3.5 font-bold text-[#090A0F] hover:bg-amber-400" href="/">Explore SeedEnv <ArrowRight className="size-4" /></Link></div></div></section>

      <footer className="relative z-10 border-t border-white/10"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-8"><p>© {new Date().getFullYear()} TERIMUS LLC. All rights reserved.</p><p className="font-mono text-xs">Building useful things for real people.</p></div></footer>
    </main>
  );
}

function Principle({ number, title }: { number: string; title: string }) {
  return <div className="flex items-center gap-4"><span className="font-mono text-xs text-amber-400">{number}</span><span className="text-lg font-semibold text-zinc-200">{title}</span><Check className="ml-auto size-4 text-emerald-400" /></div>;
}
