import { freeToolFaqs, freeToolStructuredData } from "@/lib/free-tool-discovery";
import type { FreeTool } from "@/lib/organic-growth";

export function ToolDiscovery({ tool }: { tool?: FreeTool }) {
  return <section aria-label={tool ? `About ${tool.name}` : "Free tool questions"} className="mt-10 border-t border-white/[0.08] pt-6">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(freeToolStructuredData(tool)).replace(/</g, "\\u003c") }} />
    <h2 className="text-xl font-semibold tracking-tight text-zinc-200">{tool ? `How to use ${tool.name}` : "Free tools, clear expectations"}</h2>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {freeToolFaqs(tool).map(({ question, answer }) => <article key={question} className="rounded-xl border border-white/[0.08] bg-zinc-900/30 p-4">
        <h3 className="text-sm font-medium text-zinc-200">{question}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-400">{answer}</p>
      </article>)}
    </div>
  </section>;
}
