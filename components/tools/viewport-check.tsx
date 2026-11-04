"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { CopyTextButton } from "@/components/ui/copy-text-button";
import { ToolHandoff } from "@/components/tools/tool-handoff";
import { toolTargetUrlSchema, viewportPresets } from "@/lib/organic-growth";

export function ViewportCheck() {
  const [input, setInput] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState(0);
  const [availableWidth, setAvailableWidth] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const viewport = viewportPresets[preset];
  useEffect(() => {
    if (!previewRef.current) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, [url]);
  const scale = availableWidth ? Math.min(1, availableWidth / viewport.width) : 0;
  const output = url ? [`# Viewport QA matrix`, `Target: ${url}`, "", ...viewportPresets.map((item) => `${item.name}: ${item.width} x ${item.height} CSS px`), "", "Manual checks: overflow, navigation, virtual keyboard, 44px touch targets, orientation.", "Preview only: cross-origin pages cannot be automatically inspected. No pass/fail verdict is asserted.", "Generated with https://seedenv.com/tools/viewport-check"].join("\n") : "";
  function analyze(value: string) {
    const parsed = toolTargetUrlSchema.safeParse(value);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setError("");
    setUrl(parsed.data);
  }
  return <>
    <form onSubmit={(event) => { event.preventDefault(); analyze(input); }} className="rounded-2xl border border-white/[0.08] bg-[#171923]/70 p-4 sm:p-5">
      <label htmlFor="viewport-url" className="text-sm font-medium">Your website URL</label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input id="viewport-url" value={input} onChange={(event) => setInput(event.target.value)} placeholder="https://your-app.com" inputMode="url" maxLength={2000} className="min-h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950 px-3 font-mono text-sm outline-none focus:border-emerald-400" aria-describedby={error ? "viewport-error" : "viewport-privacy"} />
        <button className="min-h-11 rounded-lg bg-emerald-400 px-5 text-sm font-semibold text-zinc-950 hover:bg-emerald-300">Check viewports</button>
      </div>
      {error ? <p id="viewport-error" role="alert" className="mt-3 text-sm text-rose-300">{error}</p> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p id="viewport-privacy" className="text-xs text-zinc-500">No server scans. Your browser opens the preview directly.</p>
        <button type="button" className="min-h-11 text-xs text-emerald-300 hover:text-emerald-200" onClick={() => { setInput("https://example.com"); analyze("https://example.com"); }}>Load sample demo</button>
      </div>
    </form>
    {url ? <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-[1.2fr_1fr]">
      <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-4">
        <h2 className="text-sm font-semibold">Responsive preview</h2>
        <div className="mt-3 flex flex-wrap gap-2">{viewportPresets.map((item, index) => <button type="button" key={item.name} aria-pressed={preset === index} onClick={() => setPreset(index)} className={`min-h-11 rounded-lg border px-3 font-mono text-xs ${preset === index ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-white/[0.08] text-zinc-400 hover:text-zinc-200"}`}>{item.width}px</button>)}</div>
        <p className="mt-4 font-mono text-xs text-zinc-400">{viewport.name} / {viewport.width} x {viewport.height} CSS px</p>
        <div ref={previewRef} className="mt-3 w-full overflow-hidden rounded-lg border border-white/10 bg-white" style={{ height: scale ? viewport.height * scale : 300 }}>
          {scale ? <iframe key={url} title={`${viewport.name} preview of ${url}`} src={url} width={viewport.width} height={viewport.height} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer" className="origin-top-left border-0" style={{ transform: `scale(${scale})`, maxWidth: "none" }} /> : <p className="animate-pulse p-6 text-sm text-zinc-600" role="status">Preparing viewport...</p>}
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">Some sites block embedding. A blank or blocked preview is not a QA failure. Sandbox restrictions may change app behavior; verify on real hardware.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm text-emerald-300">Open original site in a new tab</a>
      </section>
      <div className="min-w-0">
        <section className="rounded-2xl border border-emerald-500/20 bg-zinc-950 p-5 lg:sticky lg:top-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><MonitorSmartphone className="size-4 text-emerald-400" /> Viewport matrix</h2><CopyTextButton text={output} label="Copy matrix" /></div>
          <pre className="mt-3 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-300">{output}</pre>
        </section>
        <ToolHandoff key={url} url={url} lead="Your viewport matrix is ready." />
      </div>
    </div> : <div className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center"><MonitorSmartphone className="mx-auto size-8 text-zinc-600" /><p className="mt-3 text-sm text-zinc-400">Enter a URL to build your mobile-to-desktop testing matrix.</p></div>}
  </>;
}
