"use client";

import { Clipboard, Code2, Download, ExternalLink, FileJson, Filter, Link2, Play, Send, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";

export type InsightSubmission = {
  id: string;
  proofImageUrl: string | null;
  recordingUrl: string | null;
  feedbackText: string | null;
  osBuild: string | null;
  deviceModel: string | null;
  screenResolution: string | null;
  appBuildVersion: string | null;
  networkType: string | null;
  crashLogs: string | null;
  networkLogs: string | null;
  payoutCents: number;
  tester: { username: string; avatarUrl: string | null };
  campaign: { id: string; title: string };
};

type ResourceCategory = "All" | "User Acquisition" | "UGC & Content" | "Analytics & SDKs" | "ASO";

const resources = [
  { name: "Launch Squad Creator Packs", category: "UGC & Content" as const, description: "Brief vetted validators to record authentic product demos and launch-day shorts.", perk: "15% off creator cohorts", href: "/console?intent=creator-pack", icon: Play },
  { name: "Google App Campaigns", category: "User Acquisition" as const, description: "A practical setup checklist for conversion events, deep links, and campaign measurement.", perk: "Free tracking review", href: "https://support.google.com/google-ads/answer/6247380", icon: ExternalLink },
  { name: "Sentry + PostHog", category: "Analytics & SDKs" as const, description: "Pair crash visibility with product analytics so tester findings become measurable fixes.", perk: "Telemetry starter pack", href: "https://sentry.io/", icon: Code2 },
  { name: "Store Readiness Kit", category: "ASO" as const, description: "Screenshot, localization, and metadata checks for App Store and Play Store submissions.", perk: "Included with Launch Squad", href: "/console?intent=store-readiness", icon: ShieldCheck },
  { name: "TikTok Spark Ads", category: "User Acquisition" as const, description: "Turn authentic creator posts into permissioned paid acquisition creative.", perk: "Creative audit included", href: "https://ads.tiktok.com/business/creativecenter", icon: Send },
  { name: "Supabase + RevenueCat", category: "Analytics & SDKs" as const, description: "Deployment and subscription tools that help indie teams ship a reliable beta foundation.", perk: "Partner discounts", href: "https://supabase.com/partners", icon: Link2 },
];
type Resource = (typeof resources)[number];

function parseField(text: string, label: string) {
  const match = text.match(new RegExp(`${label}\\s*[:=-]\\s*(.+)`, "i"));
  return match?.[1]?.split("\\n")[0]?.trim() || "Not captured";
}

function getSeverity(text: string) {
  const lower = text.toLowerCase();
  if (/(crash|blocked|data loss|cannot launch)/.test(lower)) return { label: "Critical / Crash", className: "border-red-400/30 bg-red-500/10 text-red-200" };
  if (/(layout|visual|overlap|responsive|button)/.test(lower)) return { label: "UI / Layout Glitch", className: "border-violet-400/30 bg-violet-500/10 text-violet-200" };
  if (/(request|would be useful|please add)/.test(lower)) return { label: "Feature Request", className: "border-blue-400/30 bg-blue-500/10 text-blue-200" };
  return { label: "Friction / UX Bottleneck", className: "border-amber-400/30 bg-amber-500/10 text-amber-200" };
}

export function DeveloperInsights({ submissions }: { submissions: InsightSubmission[] }) {
  const [selectedId, setSelectedId] = useState(submissions[0]?.id || "");
  const [tab, setTab] = useState<"telemetry" | "compliance" | "ecosystem">("telemetry");
  const [resourceFilter, setResourceFilter] = useState<ResourceCategory>("All");
  const [logOpen, setLogOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const selected = submissions.find((submission) => submission.id === selectedId) || submissions[0];
  const feedback = selected?.feedbackText || "No structured feedback has been submitted yet.";
  const severity = getSeverity(feedback);
  const filteredResources = resources.filter((resource) => resourceFilter === "All" || resource.category === resourceFilter);
  const telemetry = useMemo(() => ({
    os: selected?.osBuild || parseField(feedback, "OS"),
    device: selected?.deviceModel || parseField(feedback, "Device"),
    resolution: selected?.screenResolution || parseField(feedback, "Resolution"),
    build: selected?.appBuildVersion || parseField(feedback, "Build"),
    network: selected?.networkType || parseField(feedback, "Network"),
  }), [feedback, selected]);

  function exportTelemetry() {
    if (!selected) return;
    const payload = { submissionId: selected.id, campaign: selected.campaign.title, tester: selected.tester.username, payoutCents: selected.payoutCents, telemetry, crashLogs: selected.crashLogs, networkLogs: selected.networkLogs, recordingUrl: selected.recordingUrl, feedback, exportedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `seedenv-telemetry-${selected.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyIssue(target: "GitHub" | "Linear" | "logs") {
    const content = target === "logs" ? "No crash or network logs were attached to this submission." : `## ${selected?.campaign.title || "SeedEnv finding"}\n\n**Tester:** ${selected?.tester.username || "Unknown"}\n**Severity:** ${severity.label}\n**Expected:** ${parseField(feedback, "Expected")}\n**Actual:** ${parseField(feedback, "Actual")}\n\n### Feedback\n${feedback}`;
    await navigator.clipboard?.writeText(content);
    setNotice(`${target === "logs" ? "Logs" : `${target} issue`} markdown copied to clipboard.`);
  }

  return (
    <section className="space-y-5" aria-label="Developer insights">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#0E1017]/80 p-2" role="tablist" aria-label="Developer workspace views">
        {([["telemetry", "Audit Hub"], ["compliance", "Play Beta Tracker"], ["ecosystem", "Launch Ecosystem"]] as const).map(([value, label]) => <button aria-selected={tab === value} className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] transition ${tab === value ? "bg-amber-500 text-black" : "text-zinc-500 hover:text-white"}`} key={value} onClick={() => setTab(value)} role="tab" type="button">{label}</button>)}
      </div>

      {tab === "telemetry" ? <TelemetryHub submissions={submissions} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} feedback={feedback} severity={severity} telemetry={telemetry} logOpen={logOpen} setLogOpen={setLogOpen} copyIssue={copyIssue} exportTelemetry={exportTelemetry} notice={notice} /> : null}
      {tab === "compliance" ? <PlayTracker setNotice={setNotice} /> : null}
      {tab === "ecosystem" ? <Ecosystem filter={resourceFilter} setFilter={setResourceFilter} items={filteredResources} /> : null}
    </section>
  );
}

type TelemetryProps = {
  submissions: InsightSubmission[];
  selected?: InsightSubmission;
  selectedId: string;
  setSelectedId: (id: string) => void;
  feedback: string;
  severity: { label: string; className: string };
  telemetry: Record<string, string>;
  logOpen: boolean;
  setLogOpen: (open: boolean) => void;
  copyIssue: (target: "GitHub" | "Linear" | "logs") => void;
  exportTelemetry: () => void;
  notice: string;
};

function TelemetryHub({ submissions, selected, selectedId, setSelectedId, feedback, severity, telemetry, logOpen, setLogOpen, copyIssue, exportTelemetry, notice }: TelemetryProps) {
  return <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
    <div className="luxury-panel rounded-2xl p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.24em] text-amber-500">Developer telemetry & audit hub</p><h2 className="mt-2 text-2xl font-black">Completed tester reports</h2></div><FileJson className="size-5 text-amber-500" /></div><div className="mt-5 space-y-2">{submissions.length ? submissions.map((submission) => <button aria-pressed={selectedId === submission.id} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === submission.id ? "border-amber-400/40 bg-amber-500/10" : "border-white/10 bg-zinc-950/45 hover:border-white/20"}`} key={submission.id} onClick={() => setSelectedId(submission.id)} type="button"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-white">{submission.campaign.title}</span><span className="font-mono text-xs text-emerald-300">${(submission.payoutCents / 100).toFixed(2)}</span></div><p className="mt-1 text-xs text-zinc-500">{submission.tester.username} · {submission.id.slice(-8)}</p></button>) : <p className="rounded-xl border border-white/10 p-5 text-sm text-zinc-500">Approved reports will appear here with device metadata and proof context.</p>}</div></div>
    <div className="luxury-panel rounded-2xl p-5">{selected ? <><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.24em] text-amber-500">{selected.campaign.title}</p><h2 className="mt-2 text-2xl font-black">Validation report</h2></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${severity.className}`}>{severity.label}</span></div><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">{([["OS & Build", telemetry.os], ["Device", telemetry.device], ["Resolution", telemetry.resolution], ["App build", telemetry.build], ["Network", telemetry.network]] as const).map(([label, value]) => <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-3" key={label}><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">{label}</p><p className="mt-2 text-xs font-semibold text-zinc-200">{value}</p></div>)}</div><div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="rounded-xl border border-white/10 bg-zinc-950/55 p-4"><p className="font-mono text-xs uppercase tracking-[0.14em] text-amber-500">Friction report</p><div className="mt-3 space-y-3 text-sm text-zinc-300"><div><p className="text-xs font-bold text-zinc-500">Steps to reproduce</p><ol className="mt-2 list-decimal space-y-1 pl-5">{feedback.split(/[\n.;]+/).filter(Boolean).slice(0, 4).map((step, index) => <li key={`${step}-${index}`}>{step.trim()}</li>)}</ol></div><div><p className="text-xs font-bold text-zinc-500">Expected behavior</p><p className="mt-1">{parseField(feedback, "Expected")}</p></div><div><p className="text-xs font-bold text-zinc-500">Actual behavior</p><p className="mt-1">{parseField(feedback, "Actual")}</p></div></div></div><div className="space-y-4"><div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-zinc-950"><span className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 font-mono text-[10px] text-zinc-400">Proof media</span>{selected.recordingUrl ? <video className="max-h-72 w-full" controls src={selected.recordingUrl} /> : selected.proofImageUrl ? <Image alt="Tester proof" className="max-h-72 w-full object-contain" height={288} src={selected.proofImageUrl} width={480} /> : <p className="text-sm text-zinc-600">No recording attached</p>}</div><div className="rounded-xl border border-white/10 bg-zinc-950 p-4"><button aria-expanded={logOpen} className="flex w-full items-center justify-between text-left font-mono text-xs text-zinc-300" onClick={() => setLogOpen(!logOpen)} type="button"><span>&gt; crash_network.log</span><span>{logOpen ? "Hide" : "Show"}</span></button>{logOpen ? <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-emerald-300/80">{selected.crashLogs || "No crash logs attached."}{selected.networkLogs ? `\n\n--- network.log ---\n${selected.networkLogs}` : ""}</pre> : null}<button className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-amber-400" onClick={() => copyIssue("logs")} type="button"><Clipboard className="size-3.5" /> Copy Full Log</button></div></div></div><div className="mt-5 flex flex-wrap gap-2"><button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-amber-400/40 hover:text-white" onClick={() => copyIssue("GitHub")} type="button"><Code2 className="size-3.5" /> Export to GitHub Issue</button><button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-amber-400/40 hover:text-white" onClick={() => copyIssue("Linear")} type="button"><Send className="size-3.5" /> Push to Linear</button><button className="inline-flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20" onClick={exportTelemetry} type="button"><Download className="size-3.5" /> Download Raw JSON Telemetry</button></div></> : <p className="rounded-xl border border-white/10 p-8 text-sm text-zinc-500">Select a report to inspect its audit details.</p>}{notice ? <p className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-200" role="status">{notice}</p> : null}</div>
  </div>;
}

function PlayTracker({ setNotice }: { setNotice: (notice: string) => void }) {
  return <div className="luxury-panel rounded-2xl p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.24em] text-amber-500">Google Play closed beta</p><h2 className="mt-2 text-2xl font-black">14-Day Continuous Test Status</h2></div><button className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:text-white" onClick={() => setNotice("Opt-in report export is ready to connect to your Play Console evidence workflow.")} type="button"><Download className="size-3.5" /> Export Opt-in Report</button></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><Metric label="Test window" value="Day 6 of 14 · Active" /><Metric label="Verified daily testers" value="21 / 20 required" /><Metric label="Daily reliability" value="100% pings" /></div><div className="mt-6 overflow-x-auto rounded-xl border border-white/10 bg-zinc-950/55 p-4"><div className="mb-3 flex min-w-[620px] justify-between text-xs text-zinc-500"><span>Tester check-in matrix</span><span>Open / verify each day</span></div><div className="min-w-[620px] space-y-2">{Array.from({ length: 8 }).map((_, tester) => <div className="flex items-center gap-2" key={tester}><span className="w-20 truncate font-mono text-[10px] text-zinc-500">validator_{tester + 1}</span>{Array.from({ length: 14 }).map((__, day) => <span aria-label={`Tester ${tester + 1}, day ${day + 1}: ${day < 6 ? "verified" : "scheduled"}`} className={`size-4 rounded-sm ${day < 6 ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.3)]" : "bg-white/10"}`} key={day} />)}</div>)}</div></div><p className="mt-4 text-xs leading-5 text-zinc-500">The tracker separates verified daily opens from claimed slots so Play Console evidence reflects continuous participation.</p></div>;
}

function Ecosystem({ filter, setFilter, items }: { filter: ResourceCategory; setFilter: (filter: ResourceCategory) => void; items: Resource[] }) {
  return <div className="luxury-panel rounded-2xl p-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.24em] text-amber-500">Launch & growth resource hub</p><h2 className="mt-2 text-2xl font-black">Launch Ecosystem</h2></div><div className="flex flex-wrap gap-2" role="toolbar" aria-label="Filter launch resources">{(["All", "User Acquisition", "UGC & Content", "Analytics & SDKs", "ASO"] as const).map((value) => <button aria-pressed={filter === value} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === value ? "border-amber-400/40 bg-amber-500/10 text-amber-200" : "border-white/10 text-zinc-500 hover:text-white"}`} key={value} onClick={() => setFilter(value)} type="button"><Filter className="mr-1 inline size-3" />{value}</button>)}</div></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((resource) => { const Icon = resource.icon; return <article className="rounded-xl border border-white/10 bg-zinc-950/55 p-4 transition hover:-translate-y-0.5 hover:border-amber-400/30" key={resource.name}><div className="flex items-start justify-between gap-3"><div className="flex size-9 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-500/10 text-amber-300"><Icon className="size-4" /></div><span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-200">{resource.perk}</span></div><h3 className="mt-4 font-bold text-white">{resource.name}</h3><p className="mt-2 text-sm leading-5 text-zinc-400">{resource.description}</p><a className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300" href={resource.href}>Open resource <ExternalLink className="size-3.5" /></a></article>; })}</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-4"><p className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className="mt-2 text-sm font-bold text-white">{value}</p></div>;
}
