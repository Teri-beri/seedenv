import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { freeTools } from "@/lib/organic-growth";

export function ToolShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main id="main-content" className="min-h-screen bg-[#09090b] px-4 pb-32 pt-6 text-zinc-200 sm:px-6">
    <div className="mx-auto max-w-6xl">
      <nav aria-label="Tool navigation" className="mb-8 flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <Link href="/tools" className="inline-flex min-h-11 items-center gap-2 font-mono text-xs text-zinc-400 hover:text-emerald-300"><ArrowLeft className="size-4" /> Free developer tools</Link>
        <Link href="/" className="font-semibold tracking-tight text-zinc-200">SeedEnv<span className="text-emerald-400">.</span></Link>
      </nav>
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400">Free utility / no signup / browser-local</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mb-6 mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p>
      {children}
      <section aria-label="More developer tools" className="mt-12 border-t border-white/[0.08] pt-6">
        <h2 className="text-sm font-semibold text-zinc-300">Keep your release moving</h2>
        <div className="mt-3 flex flex-wrap gap-3">{freeTools.map((tool) => <Link key={tool.path} href={tool.path} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/[0.08] px-3 text-sm text-zinc-400 hover:border-emerald-500/30 hover:text-emerald-300">{tool.name}<ArrowUpRight className="size-3.5" /></Link>)}</div>
      </section>
    </div>
  </main>;
}
