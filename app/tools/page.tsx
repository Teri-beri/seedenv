import Link from "next/link";
import { ArrowUpRight, Terminal } from "lucide-react";
import { freeTools } from "@/lib/organic-growth";
import { publicPageMetadata } from "@/lib/seo";
import { ToolShell } from "@/components/tools/tool-shell";

export const metadata = { ...publicPageMetadata("Free Developer Tools", "Free responsive viewport checker, QA release checklist and comment coordination detector. Instant free utility results with no signup or credit card.", "/tools"), robots: { index: true, follow: true } };

export default function ToolsPage() {
  return <ToolShell title="Small tools. Better releases." description="Practical, free utilities for your next shipping decision. No signup, no credit card, and no server-side scans.">
    <div className="grid gap-4 md:grid-cols-3">{freeTools.map((tool) => <Link key={tool.path} href={tool.path} className="group flex min-h-60 flex-col rounded-2xl border border-white/[0.08] bg-[#171923]/70 p-6 transition hover:border-emerald-500/30 hover:bg-[#171923]">
      <Terminal className="size-6 text-emerald-400" /><span className="mt-6 font-mono text-[11px] uppercase tracking-wider text-zinc-500">{tool.tag}</span><h2 className="mt-2 text-lg font-semibold">{tool.name}</h2><p className="mt-2 flex-1 text-sm leading-6 text-zinc-400">{tool.description}</p><span className="mt-5 flex items-center gap-2 text-sm text-emerald-300">Open free tool<ArrowUpRight className="size-4" /></span>
    </Link>)}</div>
  </ToolShell>;
}
