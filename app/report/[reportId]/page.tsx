import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bug, ShieldCheck, Smartphone } from "lucide-react";
import { CopyTextButton } from "@/components/ui/copy-text-button";
import { getPublicBugReport, physicalHardwareVerified } from "@/lib/public-bug-reports";
import { githubReportMarkdown, sprintHandoffPath } from "@/lib/organic-growth";
import { isStoredRecording } from "@/lib/recording";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ reportId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { reportId } = await params;
  const report = await getPublicBugReport(reportId);
  if (!report) return { title: "Report unavailable", robots: { index: false, follow: false } };
  const description = `${report.severity} bug report. ${report.deviceModel} (${report.osVersion}). ${report.summary.slice(0, 150)}`;
  const url = `${SITE_URL}/report/${report.id}`;
  const images = [{ url: `${url}/opengraph-image`, width: 1200, height: 630, alt: `${report.title} - ${report.deviceModel}` }];
  return { title: report.title, description, alternates: { canonical: url }, robots: { index: true, follow: true }, openGraph: { title: report.title, description, url, siteName: "SeedEnv", type: "article", images }, twitter: { card: "summary_large_image", title: report.title, description, images } };
}

export default async function PublicReportPage({ params }: Props) {
  const report = await getPublicBugReport((await params).reportId);
  if (!report) notFound();
  const verified = physicalHardwareVerified(report);
  const markdown = githubReportMarkdown(report).replace("### Verified Bug Report via SeedEnv", verified ? "### Verified Bug Report via SeedEnv" : "### Bug Report via SeedEnv");
  const mediaBase = `/report/${report.id}/media`;
  const severityClass = report.severity === "CRITICAL" ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : report.severity === "MAJOR" ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-sky-500/30 bg-sky-500/10 text-sky-300";
  return <main id="main-content" className="min-h-screen bg-[#09090b] px-4 pb-16 text-zinc-200 sm:px-6">
    <header className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] py-5"><Link href="/" className="text-lg font-semibold">SeedEnv<span className="text-emerald-400">.</span><span className="ml-3 font-mono text-[10px] uppercase tracking-wider text-zinc-500">Public dossier</span></Link><CopyTextButton text={markdown} label="Copy GitHub Markdown" /></header>
    <article className="mx-auto mt-8 max-w-4xl">
      <div className="flex flex-wrap items-center gap-3"><span className={`rounded-lg border px-3 py-2 font-mono text-xs ${severityClass}`}>{report.severity}</span><span className="flex items-center gap-2 font-mono text-[11px] text-zinc-400"><ShieldCheck className={`size-4 ${verified ? "text-emerald-400" : "text-zinc-500"}`} />{verified ? "Physical-device signals verified" : "Hardware not verified"}</span><span className="font-mono text-[11px] text-zinc-500">Read-only / developer-published</span></div>
      <h1 className="mt-5 break-words text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{report.title}</h1>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-400">{report.summary}</p>
      <section aria-label="Device specifications" className="mt-6 grid gap-3 sm:grid-cols-3">{[["Device", report.deviceModel], ["OS version", report.osVersion], ["Viewport / resolution", report.viewport]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/[0.08] bg-[#171923]/70 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{label}</p><p className="mt-2 flex items-start gap-2 break-words font-mono text-sm text-zinc-200"><Smartphone className="mt-0.5 size-4 shrink-0 text-zinc-500" />{value}</p></div>)}</section>
      <section className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-5 sm:p-6"><h2 className="flex items-center gap-2 text-lg font-semibold"><Bug className="size-5 text-emerald-400" />Steps to reproduce</h2><ol className="mt-4 space-y-3">{report.reproSteps.map((step, index) => <li key={index} className="flex gap-3 rounded-lg border border-white/[0.05] bg-zinc-950/70 p-4"><span className="font-mono text-xs text-emerald-400">{String(index + 1).padStart(2, "0")}</span><p className="min-w-0 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{step}</p></li>)}</ol></section>
      <section className="mt-6 rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-5"><h2 className="text-lg font-semibold">Evidence</h2>{report.proofImageUrl ? <Image src={`${mediaBase}/screenshot`} alt={`Screenshot evidence for ${report.title}`} width={1200} height={800} unoptimized className="mt-4 max-h-[600px] w-full rounded-xl border border-white/10 object-contain" /> : null}{report.recordingUrl ? isStoredRecording(report.recordingUrl) ? <video controls preload="none" src={`${mediaBase}/recording`} className="mt-4 max-h-[600px] w-full rounded-xl bg-black" /> : <a href={report.recordingUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center text-sm text-emerald-300 underline">Open screen recording (external link)</a> : null}{!report.proofImageUrl && !report.recordingUrl ? <p className="mt-3 text-sm text-zinc-500">The developer has not included public media with this report.</p> : null}</section>
      <section className="mt-6 rounded-xl border border-white/[0.08] bg-zinc-950 p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-mono text-xs text-zinc-400">GitHub issue snippet</h2><CopyTextButton text={markdown} label="Copy Markdown" /></div><pre className="mt-4 select-all whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-400">{markdown}</pre></section>
      <footer className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5"><p className="text-sm leading-6 text-zinc-300">{verified ? "Discovered and verified on physical hardware via SeedEnv Crowdsourced QA." : "Discovered via SeedEnv Crowdsourced QA. Physical hardware was not verified."}</p><Link href={sprintHandoffPath()} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-300">Post a Testing Sprint on Your Repo</Link><p className="mt-3 text-xs leading-5 text-zinc-500">Published with the developer&apos;s permission. Hardware badges describe captured device signals, not an independent certification.</p></footer>
    </article>
  </main>;
}
