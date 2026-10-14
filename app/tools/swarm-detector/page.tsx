"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Clipboard, ClipboardPaste, Copy, Download, Grid2x2, Megaphone, Play, Radar, ScanSearch, ShieldCheck, Siren, Sparkles, Upload } from "lucide-react";
import {
  analyzeCoordination,
  classifyForensics,
  computeSwarmMetrics,
  getSanityVerdict,
  parseSwarmInput,
  type SanityVerdict,
  type SwarmEntry,
} from "@/lib/swarm-detector";

type AspectMode = "story" | "card";
type CommentFilter = "all" | "organic";
type ReceiptTheme = "cyber" | "hazard" | "dossier";
type PlatformPreset = "developer" | "tiktok" | "x" | "reddit" | "youtube" | "instagram";
type CopyState = "idle" | "copied" | "error";
type AnalysisTab = "radar" | "matrix";

const howToSteps = [
  {
    step: "1",
    title: "Copy",
    body: "Highlight & copy comments from any desktop browser thread (TikTok, X, Instagram).",
  },
  {
    step: "2",
    title: "Paste",
    body: "Drop the text into the box below (our smart cleaner strips timestamps and likes automatically).",
  },
  {
    step: "3",
    title: "Expose",
    body: "Get your sanity verdict and download a verified receipt card to post back in the thread.",
  },
] as const;

const verdictStyles = {
  alarm: {
    card: "border-rose-500/40 bg-rose-500/10",
    title: "text-rose-200",
    body: "text-rose-100/80",
    chip: "border-rose-500/40 bg-rose-500/15 text-rose-200",
  },
  caution: {
    card: "border-amber-500/40 bg-amber-500/10",
    title: "text-amber-200",
    body: "text-amber-100/80",
    chip: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  },
  calm: {
    card: "border-emerald-500/40 bg-emerald-500/10",
    title: "text-emerald-200",
    body: "text-emerald-100/80",
    chip: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  },
} as const;

const auditPhases = [
  "[1/3] Tokenizing linguistic n-grams...",
  "[2/3] Mapping temporal burst velocities...",
  "[3/3] Isolating coordinated narrative clusters...",
] as const;

const platformPresets: Array<{ id: PlatformPreset; label: string }> = [
  { id: "developer", label: "Dev Platform / API" },
  { id: "tiktok", label: "TikTok Format" },
  { id: "x", label: "X Format" },
  { id: "reddit", label: "Reddit Format" },
  { id: "youtube", label: "YouTube Format" },
  { id: "instagram", label: "Instagram Format" },
];

const initialInput = `@signal.watch · 2m ago
The pricing page hides the real fees. Cancel this launch now.
Reply
184 likes

truthwire
The pricing page is hiding the real fees. Cancel the launch now.
3m ago
Reply
View 14 replies

maya.dev
The onboarding was clear, but the pricing explanation could be easier to find.
18m ago
12 likes`;

const politicalDemo = `@civic_signal · 44s ago
This policy is a corrupt disaster. Reject the plan before it destroys everything.
Reply
2,104 likes

ballotwatch
This policy is a corrupt disaster. Reject the plan before it destroys everything.
51s ago
Reply
1,988 likes

publicvoice_24
The plan is a corrupt disaster and must be rejected before it destroys everything.
1m ago
Reply
View 81 replies

local_reader
I disagree with part of the proposal, but the infrastructure section seems useful.
18m ago
34 likes`;

const cryptoDemo = JSON.stringify([
  { author: "token_alarm_01", text: "This developer token is a fake scam. Sell now before the app collapses.", timeOffsetSec: 18 },
  { author: "token_alarm_02", text: "This developer token is a fake scam. Sell now before the app collapses.", timeOffsetSec: 24 },
  { author: "token_alarm_03", text: "The developer token is a fake scam, sell now before this app collapses.", timeOffsetSec: 31 },
  { author: "token_alarm_04", text: "Fake developer token and scam app. Sell now before it collapses.", timeOffsetSec: 39 },
  { author: "build_tester", text: "The wallet connection worked, but the transaction history loaded slowly.", timeOffsetSec: 1_200 },
], null, 2);

const quadrantCopy = {
  "Manufactured Hate": "High coordination paired with consistently negative language.",
  "Synthetic Praise": "High coordination paired with consistently positive language.",
  "Genuine Backlash": "Low coordination with independently expressed negative sentiment.",
  "Organic Discourse": "Low coordination with balanced, varied human sentiment.",
} as const;

function normalizeToken(raw: string) {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

function highlightedText(text: string, recurringTokens: Set<string>) {
  return text.split(/(\s+)/).map((part, index) => {
    const highlighted = recurringTokens.has(normalizeToken(part));
    return highlighted ? (
      <span key={`${part}-${index}`} className="rounded bg-amber-500/10 px-1.5 py-0.5 font-mono text-xs text-amber-300">{part}</span>
    ) : <span key={`${part}-${index}`}>{part}</span>;
  });
}

function themeClasses(theme: ReceiptTheme) {
  if (theme === "hazard") return {
    shell: "border-amber-400 bg-black text-amber-50",
    accent: "text-amber-300",
    panel: "border-amber-500/40 bg-amber-400/10",
    muted: "text-amber-200/60",
    line: "border-amber-500/30",
  };
  if (theme === "dossier") return {
    shell: "border-zinc-300 bg-white text-zinc-950",
    accent: "text-zinc-950",
    panel: "border-zinc-300 bg-zinc-100",
    muted: "text-zinc-500",
    line: "border-zinc-300",
  };
  return {
    shell: "border-zinc-700 bg-[#0b0d12] text-zinc-100",
    accent: "text-emerald-300",
    panel: "border-zinc-800 bg-zinc-950/75",
    muted: "text-zinc-500",
    line: "border-zinc-800",
  };
}

export default function SwarmDetectorPage() {
  const [rawInput, setRawInput] = useState(initialInput);
  const [auditedInput, setAuditedInput] = useState(initialInput);
  const [platformPreset, setPlatformPreset] = useState<PlatformPreset>("tiktok");
  const [aspectMode, setAspectMode] = useState<AspectMode>("card");
  const [receiptTheme, setReceiptTheme] = useState<ReceiptTheme>("cyber");
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");
  const [analysisTab, setAnalysisTab] = useState<AnalysisTab>("radar");
  const [auditPhase, setAuditPhase] = useState<number | null>(null);
  const [hasResults, setHasResults] = useState(true);
  const [inputDirty, setInputDirty] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const auditTimers = useRef<number[]>([]);

  useEffect(() => () => auditTimers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const entries = useMemo(() => parseSwarmInput(auditedInput), [auditedInput]);
  const metrics = useMemo(() => computeSwarmMetrics(entries), [entries]);
  const coordination = useMemo(() => analyzeCoordination(entries), [entries]);
  const classification = useMemo(
    () => classifyForensics(entries, metrics, coordination),
    [coordination, entries, metrics],
  );
  const flaggedAuthors = useMemo(() => new Set(coordination.flaggedAuthors), [coordination.flaggedAuthors]);
  const verdict = useMemo(() => getSanityVerdict(metrics.inauthenticityIndex), [metrics.inauthenticityIndex]);
  const recurringTokens = useMemo(() => new Set(coordination.recurringTokens), [coordination.recurringTokens]);
  const visibleComments = useMemo(
    () => commentFilter === "all" ? entries : entries.filter((entry) => !flaggedAuthors.has(entry.author.toLowerCase())),
    [commentFilter, entries, flaggedAuthors],
  );
  const socialClipboardDetected = Boolean(
    auditedInput.trim()
    && !auditedInput.trim().startsWith("[")
    && !auditedInput.split(/\r?\n/).some((line) => line.split("|").length >= 3),
  );

  const loadInput = (value: string, preset: PlatformPreset) => {
    auditTimers.current.forEach((timer) => window.clearTimeout(timer));
    setRawInput(value);
    setPlatformPreset(preset);
    setInputDirty(true);
    setInputError(null);
    setAuditPhase(null);
  };

  const runAudit = () => {
    const pendingEntries = parseSwarmInput(rawInput);
    if (!pendingEntries.length) {
      setInputError("No comment records were detected. Paste comment text or upload a JSON array and try again.");
      return;
    }
    auditTimers.current.forEach((timer) => window.clearTimeout(timer));
    setInputError(null);
    setHasResults(false);
    setAuditPhase(0);
    auditTimers.current = [
      window.setTimeout(() => setAuditPhase(1), 400),
      window.setTimeout(() => setAuditPhase(2), 800),
      window.setTimeout(() => {
        setAuditedInput(rawInput);
        setHasResults(true);
        setInputDirty(false);
        setAuditPhase(null);
      }, 1_200),
    ];
  };

  const uploadJson = async (file: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setInputError("JSON uploads must be 2MB or smaller.");
      return;
    }
    try {
      const content = await file.text();
      const parsed = JSON.parse(content) as unknown;
      if (!Array.isArray(parsed)) throw new Error("JSON must contain an array of comment records.");
      loadInput(JSON.stringify(parsed, null, 2), "developer");
    } catch (error) {
      setInputError(error instanceof Error ? error.message : "The JSON file could not be read.");
    }
  };

  const downloadPng = async () => {
    if (!receiptRef.current) return;
    setExportError(null);
    try {
      const dataUrl = await toPng(receiptRef.current, {
        cacheBust: true,
        pixelRatio: 4,
        width: aspectMode === "story" ? 280 : 498,
        height: aspectMode === "story" ? 498 : 280,
        backgroundColor: receiptTheme === "dossier" ? "#ffffff" : receiptTheme === "hazard" ? "#000000" : "#09090b",
      });
      const link = document.createElement("a");
      link.download = `seedenv-swarm-forensics-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error("Swarm receipt export failed:", error);
      setExportError("The receipt could not be exported. Wait for fonts to load and try again.");
    }
  };

  const copyDebunkReply = async () => {
    const reply = `⚠️ SeedEnv Forensics classified this sample as ${classification.quadrant}: ${metrics.inauthenticityIndex}% inauthenticity index, ${coordination.flaggedRatio}% flagged accounts. Verify the receipt: seedenv.com/tools/swarm-detector`;
    try {
      await navigator.clipboard.writeText(reply);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1_800);
    } catch (error) {
      console.error("Clipboard copy failed:", error);
      setCopyState("error");
    }
  };

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-zinc-800 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_34%),#0b0d12] p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-200">
                <Radar className="size-3.5" /> SeedEnv Trust Utility
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-5xl">SeedEnv SwarmForensics</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">Paste the comments from any thread and find out if the pile-on is real people or a coordinated swarm. Everything runs locally in your browser — no scraping, no logins, no data leaves this page.</p>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4 font-mono text-[10px] uppercase leading-5 tracking-[0.16em] text-zinc-400">
              <p className="text-emerald-300">● Local browser analysis</p>
              <p>● Zero platform scraping</p>
              <p>● No account authentication</p>
            </div>
          </div>

          <ol className="mt-7 grid gap-3 sm:grid-cols-3">
            {howToSteps.map((item) => (
              <li key={item.step} className="flex items-start gap-3 rounded-2xl border border-zinc-800 bg-black/30 p-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 font-mono text-xs font-semibold text-emerald-300">{item.step}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </header>

        <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ClipboardPaste className="size-5 text-emerald-400" />
              <h2 className="text-xl font-semibold text-white sm:text-2xl">Step 1: Paste Thread</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/5 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-emerald-300"><Sparkles className="size-3" />Smart cleaner on</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Paste the comments exactly as you copied them. We strip handles, timestamps, like counts, and &ldquo;Reply&rdquo; clutter automatically.</p>

          <div className="mt-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">No thread handy? Fill it with one click</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => loadInput(politicalDemo, "tiktok")} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-rose-500/25 bg-rose-500/5 px-4 py-2 text-sm text-rose-200 transition hover:border-rose-400/60 hover:text-rose-100"><Megaphone className="size-4" />Try Political Demo</button>
              <button type="button" onClick={() => loadInput(cryptoDemo, "developer")} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/5 px-4 py-2 text-sm text-amber-200 transition hover:border-amber-400/60 hover:text-amber-100"><Siren className="size-4" />Try Crypto Demo</button>
            </div>
          </div>

          <div className="relative mt-4">
            <textarea value={rawInput} onChange={(event) => { setRawInput(event.target.value); setInputDirty(true); setInputError(null); }} spellCheck={false} aria-label="Paste comment thread" className="min-h-72 w-full resize-none rounded-2xl border border-zinc-800 bg-[#080a0f] p-4 pb-24 font-mono text-sm leading-6 text-zinc-200 outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 sm:pb-16" placeholder="Paste the comments here..." />
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:justify-between">
              <label className="pointer-events-auto inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/95 px-4 py-2 text-sm text-zinc-300 backdrop-blur hover:border-zinc-500 hover:text-white">
                <Upload className="size-4" /> Upload JSON
                <input type="file" accept="application/json,.json" className="sr-only" onChange={(event) => { void uploadJson(event.target.files?.[0] ?? null); event.target.value = ""; }} />
              </label>
              <button type="button" onClick={runAudit} disabled={auditPhase !== null} className="pointer-events-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-2 text-sm font-semibold text-zinc-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"><Play className="size-4" />{auditPhase === null ? "Run Forensic Audit" : "Audit in progress..."}</button>
            </div>
          </div>

          <details className="mt-4 rounded-2xl border border-zinc-800/80 bg-black/20 p-3">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500 hover:text-zinc-300">Advanced: source format</summary>
            <p className="mt-2 text-xs leading-5 text-zinc-500">The format only tunes parsing hints. SeedEnv never connects to, logs into, or scrapes these services.</p>
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Data format preset">
              {platformPresets.map((preset) => (
                <button key={preset.id} type="button" aria-pressed={platformPreset === preset.id} onClick={() => setPlatformPreset(preset.id)} className={`rounded-full border px-3 py-2 text-xs transition ${platformPreset === preset.id ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white"}`}>{preset.label}</button>
              ))}
            </div>
          </details>
          {inputDirty && auditPhase === null ? <p className="mt-3 text-xs text-amber-300">Input changed. Run a new forensic audit to update the evidence report.</p> : null}
          {inputError ? <p role="alert" className="mt-3 text-sm text-rose-300">{inputError}</p> : null}
        </section>

        {auditPhase !== null ? <DiagnosticHud phase={auditPhase} /> : null}

        {hasResults ? (
          <>
            <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950/75 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Radar className="size-5 text-emerald-400" />
                  <h2 className="text-xl font-semibold text-white sm:text-2xl">Step 2: Detection Radar &amp; Verdict</h2>
                </div>
                <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-300">{entries.length} comments read</span>
              </div>

              <div className={`mt-5 rounded-2xl border p-5 ${verdictStyles[verdict.tone].card}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">Your sanity verdict</p>
                    <p className={`mt-2 text-2xl font-semibold leading-8 sm:text-3xl ${verdictStyles[verdict.tone].title}`}>
                      <span aria-hidden="true">{verdict.emoji}</span> {verdict.title}
                    </p>
                    <p className={`mt-2 max-w-2xl text-sm leading-6 sm:text-base ${verdictStyles[verdict.tone].body}`}>{verdict.message}</p>
                  </div>
                  <div className={`shrink-0 rounded-2xl border px-4 py-3 text-center ${verdictStyles[verdict.tone].chip}`}>
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] opacity-80">Swarm score</p>
                    <p className="mt-1 text-3xl font-semibold">{metrics.inauthenticityIndex}%</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
                <SummaryMetric label="Flagged accounts" value={`${coordination.flaggedRatio}%`} />
                <SummaryMetric label="Unique accounts" value={`${metrics.uniqueAuthors}`} />
                <SummaryMetric label="Arrival speed" value={`${classification.arrivalVelocity.toFixed(3)}/s`} />
              </div>

              <div className="mt-5 inline-flex rounded-full border border-zinc-800 bg-black/30 p-1" role="tablist" aria-label="Analysis view">
                {([["radar", "Detection Radar"], ["matrix", "Sentiment Matrix"]] as const).map(([tab, label]) => (
                  <button key={tab} type="button" role="tab" id={`swarm-tab-${tab}`} aria-selected={analysisTab === tab} aria-controls={`swarm-panel-${tab}`} onClick={() => setAnalysisTab(tab)} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm transition ${analysisTab === tab ? "bg-emerald-500/15 text-emerald-200" : "text-zinc-400 hover:text-white"}`}>
                    {tab === "radar" ? <Radar className="size-4" /> : <Grid2x2 className="size-4" />}
                    {label}
                  </button>
                ))}
              </div>

              {analysisTab === "radar" ? (
                <div role="tabpanel" id="swarm-panel-radar" aria-labelledby="swarm-tab-radar" className="mt-4 rounded-2xl border border-zinc-800 bg-black/20 p-4">
                  <p className="text-sm leading-6 text-zinc-400">Tight, pulsing dots in the center are accounts posting the same message at the same time. Scattered grey dots around the edge are independent people.</p>
                  <SwarmClusterMap entries={entries} flaggedAuthors={flaggedAuthors} theme="cyber" className="mt-4 h-[280px] w-full" interactive />
                  <div className="mt-4 flex flex-wrap gap-4 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500"><span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-zinc-500" />Authentic perimeter</span><span className="inline-flex items-center gap-1.5"><span className="size-2 animate-pulse rounded-full bg-rose-500" />Coordinated cluster</span></div>
                </div>
              ) : (
                <div role="tabpanel" id="swarm-panel-matrix" aria-labelledby="swarm-tab-matrix" className="mt-4 rounded-2xl border border-zinc-800 bg-black/20 p-4">
                  <p className="text-sm leading-6 text-zinc-400">This compares how negative the thread is against how synchronized it is. The highlighted box is where your thread lands.</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {(Object.keys(quadrantCopy) as Array<keyof typeof quadrantCopy>).map((quadrant) => {
                      const active = classification.quadrant === quadrant;
                      return <div key={quadrant} className={`rounded-xl border p-3 ${active ? "border-emerald-400/50 bg-emerald-500/10 ring-1 ring-emerald-500/20" : "border-zinc-800 bg-black/20 opacity-55"}`}><p className={`text-sm font-semibold ${active ? "text-emerald-200" : "text-zinc-400"}`}>{quadrant}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{quadrantCopy[quadrant]}</p></div>;
                    })}
                  </div>
                  <div className="mt-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4"><p className="text-lg font-semibold text-white">{classification.quadrant}</p><p className="mt-1 text-sm leading-6 text-zinc-300">{quadrantCopy[classification.quadrant]} Overall tone reads as {classification.sentimentLabel.toLowerCase()}.</p></div>
                </div>
              )}
            </section>

            <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950/75 p-5 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex items-center gap-2"><Copy className="size-5 text-amber-300" /><h2 className="text-xl font-semibold text-white">The copy-paste script</h2></div><p className="mt-2 text-sm leading-6 text-zinc-400">These are the repeated lines we matched across accounts. Switch to organic-only to read just the real people.</p></div><div className="inline-flex rounded-full border border-zinc-800 bg-black/30 p-1">{(["all", "organic"] as const).map((filter) => <button key={filter} type="button" aria-pressed={commentFilter === filter} onClick={() => setCommentFilter(filter)} className={`rounded-full px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] ${commentFilter === filter ? "bg-emerald-500/15 text-emerald-200" : "text-zinc-500"}`}>{filter === "all" ? "All Comments" : "Organic Only"}</button>)}</div></div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Flagged narrative quotes</p><div className="mt-3 space-y-3">{coordination.duplicatePhrases.length ? coordination.duplicatePhrases.map((phrase) => <blockquote key={phrase} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm leading-6 text-zinc-200">“{highlightedText(phrase, recurringTokens)}”</blockquote>) : <p className="text-sm text-zinc-500">No coordinated phrase cluster was found.</p>}</div></div>
                <div className="rounded-2xl border border-zinc-800 bg-black/20 p-4"><p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">Comment evidence</p><div className="mt-3 max-h-[460px] space-y-3 overflow-y-auto pr-1">{visibleComments.length ? visibleComments.map((entry, index) => { const flagged = flaggedAuthors.has(entry.author.toLowerCase()); return <article key={`${entry.author}-${entry.timestamp}-${index}`} className={`rounded-xl border p-3 ${flagged ? "border-rose-500/20 bg-rose-500/5" : "border-zinc-800 bg-[#0b0d12]"}`}><div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500"><span>{entry.author}</span><span>{entry.timestamp || "No timestamp"}</span></div><p className="mt-2 text-sm leading-6 text-zinc-300">{flagged ? highlightedText(entry.text, recurringTokens) : entry.text}</p></article>; }) : <p className="text-sm text-zinc-500">No organic comments remain after removing the coordinated cluster.</p>}</div></div>
              </div>
            </section>

            <ReceiptSection aspectMode={aspectMode} setAspectMode={setAspectMode} receiptTheme={receiptTheme} setReceiptTheme={setReceiptTheme} receiptRef={receiptRef} metrics={metrics} coordination={coordination} classification={classification} verdict={verdict} entries={entries} flaggedAuthors={flaggedAuthors} onDownload={() => { void downloadPng(); }} onCopy={() => { void copyDebunkReply(); }} copyState={copyState} exportError={exportError} />
            {socialClipboardDetected ? <p className="mt-4 text-center text-xs text-emerald-300">Auto-sanitizer recovered {entries.length} records from raw social-feed clipboard text.</p> : null}
          </>
        ) : null}

        <LegalDisclaimer />
      </div>
    </main>
  );
}

function DiagnosticHud({ phase }: { phase: number }) {
  return <section role="status" aria-live="polite" className="mt-6 rounded-3xl border border-emerald-500/25 bg-black p-5 font-mono text-xs leading-7 shadow-[0_0_30px_rgba(16,185,129,0.08)]"><p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-zinc-600">SeedEnv forensic runtime</p>{auditPhases.map((step, index) => <p key={step} className={index < phase ? "text-emerald-500" : index === phase ? "animate-pulse text-emerald-200" : "text-zinc-800"}>{step}</p>)}</section>;
}

function ReceiptSection({ aspectMode, setAspectMode, receiptTheme, setReceiptTheme, receiptRef, metrics, coordination, classification, verdict, entries, flaggedAuthors, onDownload, onCopy, copyState, exportError }: {
  aspectMode: AspectMode;
  setAspectMode: (value: AspectMode) => void;
  receiptTheme: ReceiptTheme;
  setReceiptTheme: (value: ReceiptTheme) => void;
  receiptRef: React.RefObject<HTMLDivElement | null>;
  metrics: ReturnType<typeof computeSwarmMetrics>;
  coordination: ReturnType<typeof analyzeCoordination>;
  classification: ReturnType<typeof classifyForensics>;
  verdict: SanityVerdict;
  entries: SwarmEntry[];
  flaggedAuthors: Set<string>;
  onDownload: () => void;
  onCopy: () => void;
  copyState: CopyState;
  exportError: string | null;
}) {
  const theme = themeClasses(receiptTheme);
  return <section className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-950/75 p-5 sm:p-6"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><div className="flex items-center gap-2"><Download className="size-5 text-emerald-400" /><h2 className="text-xl font-semibold text-white sm:text-2xl">Step 3: Export Receipts</h2></div><p className="mt-2 text-sm leading-6 text-zinc-400">Download the card and post it straight back into the thread.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={onDownload} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950"><Download className="size-4" />Download PNG</button><button type="button" onClick={onCopy} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200"><Clipboard className="size-4" />{copyState === "copied" ? "Copied" : "Copy Debunk Reply"}</button></div></div>{copyState === "error" ? <p role="alert" className="mt-3 text-sm text-rose-300">Clipboard permission was blocked. Allow clipboard access and retry.</p> : null}{exportError ? <p role="alert" className="mt-3 text-sm text-rose-300">{exportError}</p> : null}
    <div className="mt-5 grid gap-4 lg:grid-cols-2"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Theme</p><div className="mt-2 flex flex-wrap gap-2">{(["cyber", "hazard", "dossier"] as const).map((item) => <button key={item} type="button" aria-pressed={receiptTheme === item} onClick={() => setReceiptTheme(item)} className={`rounded-full border px-3 py-2 text-xs ${receiptTheme === item ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-zinc-800 text-zinc-500"}`}>{item === "cyber" ? "Cyber Dark" : item === "hazard" ? "Hazard Alert" : "White Dossier"}</button>)}</div></div><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">Aspect ratio</p><div className="mt-2 flex flex-wrap gap-2">{(["card", "story"] as const).map((item) => <button key={item} type="button" aria-pressed={aspectMode === item} onClick={() => setAspectMode(item)} className={`rounded-full border px-3 py-2 text-xs ${aspectMode === item ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-zinc-800 text-zinc-500"}`}>{item === "card" ? "Standard Card (16:9)" : "TikTok/Reels Story (9:16)"}</button>)}</div></div></div>
    <div className="mt-5 max-w-full overflow-x-auto rounded-2xl border border-zinc-800/60 bg-black/30 p-2"><div ref={receiptRef} className={`relative isolate mx-auto shrink-0 rounded-2xl border p-5 ${theme.shell} ${aspectMode === "story" ? "h-[498px] w-[280px]" : "h-[280px] w-[498px]"}`}><div className={`flex items-center justify-between border-b pb-3 ${theme.line}`}><p className={`font-mono text-[9px] uppercase tracking-[0.18em] ${theme.accent}`}>SeedEnv SwarmForensics</p><ShieldCheck className={`size-4 ${theme.accent}`} /></div>{aspectMode === "story" ? <div className="flex h-[430px] flex-col"><div className={`mt-4 rounded-xl border p-3 ${theme.panel}`}><p className={`font-mono text-[8px] uppercase tracking-[0.14em] ${theme.muted}`}>Sanity verdict</p><p className="mt-1 text-xl font-semibold leading-6"><span aria-hidden="true">{verdict.emoji}</span> {verdict.title}</p><p className={`mt-1 text-[10px] leading-4 ${theme.muted}`}>{classification.quadrant}</p></div><div className="mt-3 grid grid-cols-3 gap-2"><ReceiptMetric theme={receiptTheme} label="Index" value={`${metrics.inauthenticityIndex}%`} /><ReceiptMetric theme={receiptTheme} label="Flagged" value={`${coordination.flaggedRatio}%`} /><ReceiptMetric theme={receiptTheme} label="Velocity" value={`${classification.arrivalVelocity.toFixed(3)}/s`} /></div><SwarmClusterMap entries={entries} flaggedAuthors={flaggedAuthors} theme={receiptTheme} className="mt-3 h-32 w-full" /><p className={`mt-auto border-t pt-3 font-mono text-[8px] uppercase leading-4 tracking-[0.12em] ${theme.line} ${theme.muted}`}>Analyzed by SeedEnv Forensics<br />seedenv.com/tools/swarm-detector</p></div> : <div className="mt-4 grid h-[208px] grid-cols-[0.86fr_1.14fr] grid-rows-[208px] gap-4"><div className={`flex min-h-0 flex-col overflow-hidden border-r pr-4 ${theme.line}`}><p className={`font-mono text-[8px] uppercase tracking-[0.14em] ${theme.muted}`}>Sanity verdict</p><p className="mt-2 text-xl font-semibold leading-6"><span aria-hidden="true">{verdict.emoji}</span> {verdict.title}</p><p className={`mt-2 text-xs leading-5 ${theme.muted}`}>{classification.quadrant} · {classification.sentimentLabel} sentiment</p><p className={`mt-auto font-mono text-[8px] uppercase leading-4 tracking-[0.1em] ${theme.muted}`}>Analyzed by SeedEnv Forensics<br />seedenv.com/tools/swarm-detector</p></div><div className="flex min-h-0 min-w-0 flex-col"><div className="grid grid-cols-3 gap-2"><ReceiptMetric theme={receiptTheme} label="Index" value={`${metrics.inauthenticityIndex}%`} /><ReceiptMetric theme={receiptTheme} label="Flagged" value={`${coordination.flaggedRatio}%`} /><ReceiptMetric theme={receiptTheme} label="Velocity" value={`${classification.arrivalVelocity.toFixed(3)}/s`} /></div><SwarmClusterMap entries={entries} flaggedAuthors={flaggedAuthors} theme={receiptTheme} className="mt-2 min-h-0 flex-1" /></div></div>}</div></div>
  </section>;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-zinc-800 bg-black/25 p-3"><p className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">{label}</p><p className="mt-2 text-lg font-semibold text-white">{value}</p></div>;
}

function ReceiptMetric({ theme, label, value }: { theme: ReceiptTheme; label: string; value: string }) {
  const style = themeClasses(theme);
  return <div className={`rounded-lg border px-2 py-2 ${style.panel}`}><p className={`font-mono text-[7px] uppercase tracking-[0.1em] ${style.muted}`}>{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>;
}

/** Trig results can differ by one ULP between the server and browser, which breaks hydration. */
function roundCoord(value: number) {
  return Math.round(value * 1000) / 1000;
}

function stableHash(value: string) {  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); }
  return hash >>> 0;
}

function SwarmClusterMap({ entries, flaggedAuthors, theme, className, interactive = false }: { entries: SwarmEntry[]; flaggedAuthors: Set<string>; theme: ReceiptTheme; className: string; interactive?: boolean }) {
  const gradientId = useId().replace(/:/g, "");
  const [hovered, setHovered] = useState<{ author: string; classification: string; text: string; x: number; y: number } | null>(null);
  const accountEntries = [...new Map(entries.map((entry) => [entry.author.toLowerCase(), entry])).entries()];
  const points = accountEntries.map(([authorKey, entry], index) => {
    const hash = stableHash(authorKey);
    const flagged = flaggedAuthors.has(authorKey);
    const angle = flagged ? (hash % 360) * Math.PI / 180 : ((index / Math.max(1, accountEntries.length)) * 360 + hash % 24) * Math.PI / 180;
    const radius = flagged ? 8 + hash % 10 : 32 + hash % 11;
    return { author: entry.author, text: entry.text, flagged, x: roundCoord(50 + Math.cos(angle) * radius), y: roundCoord(50 + Math.sin(angle) * radius), color: flagged ? (theme === "hazard" || hash % 2 === 0 ? "#f59e0b" : "#f43f5e") : "#71717a" };
  });
  const grid = theme === "dossier" ? "#d4d4d8" : theme === "hazard" ? "#78350f" : "#27272a";
  const sweep = theme === "dossier" ? "#18181b" : theme === "hazard" ? "#f59e0b" : "#10b981";
  return <div className={`relative ${className}`}><svg viewBox="0 0 100 100" role="img" aria-label={`Radar map with ${flaggedAuthors.size} coordinated accounts`} className="h-full w-full" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={sweep} stopOpacity="0" /><stop offset="1" stopColor={sweep} stopOpacity="0.9" /></linearGradient></defs>{[16, 29, 42].map((radius) => <circle key={radius} cx="50" cy="50" r={radius} fill="none" stroke={grid} strokeWidth="0.55" strokeDasharray="2 2" />)}<path d="M50 5V95M5 50H95" stroke={grid} strokeWidth="0.35" /><g><line x1="50" y1="50" x2="50" y2="5" stroke={`url(#${gradientId})`} strokeWidth="1.2" /><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="4s" repeatCount="indefinite" /></g>{points.filter((point) => point.flagged).map((point) => <line key={`line-${point.author}`} x1="50" y1="50" x2={point.x} y2={point.y} stroke={point.color} strokeWidth="0.55" opacity="0.45" />)}<circle cx="50" cy="50" r="3.5" fill="none" stroke={sweep} strokeWidth="1.1" /><circle cx="50" cy="50" r="1.3" fill={sweep} />{points.map((point) => <g key={point.author}><circle cx={point.x} cy={point.y} r={point.flagged ? 2.2 : 1.6} fill={point.color} opacity={point.flagged ? 0.95 : 0.72}>{point.flagged ? <animate attributeName="r" values="2.1;3.2;2.1" dur="1.8s" repeatCount="indefinite" /> : null}</circle>{interactive ? <circle cx={point.x} cy={point.y} r="4.5" fill="transparent" className="cursor-crosshair" tabIndex={0} onMouseEnter={() => setHovered({ author: point.author, classification: point.flagged ? "Coordinated cluster" : "Likely organic", text: point.text, x: point.x, y: point.y })} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered({ author: point.author, classification: point.flagged ? "Coordinated cluster" : "Likely organic", text: point.text, x: point.x, y: point.y })} onBlur={() => setHovered(null)} /> : null}</g>)}</svg>{interactive && hovered ? <div className="pointer-events-none absolute z-20 w-52 -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-950/95 p-3 text-left shadow-xl" style={{ left: `${hovered.x}%`, top: `${Math.min(76, hovered.y)}%` }}><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-emerald-300">{hovered.author}</p><p className="mt-1 text-xs font-semibold text-white">{hovered.classification}</p><p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-400">{hovered.text}</p></div> : null}</div>;
}

function LegalDisclaimer() {
  return <aside className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs leading-6 text-zinc-500"><div className="flex items-start gap-3"><ScanSearch className="mt-1 size-4 shrink-0 text-zinc-400" /><p><strong className="text-zinc-300">Legal and trademark notice.</strong> All third-party product names (e.g., TikTok, X, Reddit) are trademarks of their respective owners. References are solely for data format compatibility under nominative fair use. SeedEnv is independent and not endorsed by or affiliated with these platforms.</p></div><p className="mt-2 border-t border-zinc-800 pt-2">SeedEnv processes only text you paste or JSON you upload. This utility does not scrape, authenticate with, or retrieve data from any third-party platform.</p></aside>;
}
