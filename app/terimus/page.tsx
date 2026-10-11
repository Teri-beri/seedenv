import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { StatusPill } from "@/components/StatusPill";

export const metadata: Metadata = {
  title: { absolute: "TERIMUS LLC | SeedEnv Corporate Operator" },
  description: "TERIMUS LLC is the corporate operator behind SeedEnv and an independent product studio building developer utilities, validation infrastructure, and consumer applications.",
  alternates: { canonical: "/terimus" },
};

const sunbizRecord = "https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResultDetail?inquirytype=EntityName&directionType=Initial&searchNameOrder=TERIMUS%20L250005445050&aggregateId=flal-l25000544505-b016af34-9559-48b7-a196-ad70882e96d8&searchTerm=TERIMUS%20LLC&listNameOrder=TERIMUS%20L250005445050";

const portfolio = [
  {
    tags: ["Live infrastructure", "B2B / Dev tools"],
    title: "SeedEnv",
    text: "Pre-release QA and human validation platform connecting engineering teams with physical device telemetry and escrowed bounties.",
    link: { href: "/", label: "Launch SeedEnv Console" },
  },
  {
    tags: ["Mobile ecosystem", "TestFlight beta"],
    title: "Goddesses",
    text: "High-performance native mobile social experience engineered with Flutter, real-time live streaming telemetry, and in-app commerce rails.",
    status: "Active TestFlight Cohort",
  },
  {
    tags: ["Telemetry hardware"],
    title: "LoCat",
    text: "A focused physical tracking and device telemetry program spanning enclosure design, low-power firmware, and field validation.",
    status: "CAD & Firmware Staging",
  },
];

const corporateDetails = [
  { label: "Legal Entity", value: "TERIMUS LLC" },
  { label: "Jurisdiction", value: "Florida, United States · Verified", href: sunbizRecord, external: true },
  { label: "Florida Document Number", value: "L25000544505", href: sunbizRecord, external: true },
  { label: "Primary Focus", value: "Mobile Software & Web Infrastructure" },
  { label: "Security & Inquiries", value: "terimus@seedenv.com", href: "mailto:terimus@seedenv.com" },
];

const container = "mx-auto w-full max-w-5xl px-4 sm:px-6";
const metaLabel = "font-mono text-xs uppercase tracking-wider text-zinc-400";
const card = "rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 transition-colors hover:border-zinc-700";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400";

export default function TerimusPage() {
  return (
    <div className="min-h-screen bg-[#0A0D12] text-zinc-100 [color-scheme:dark]">
      <AnalyticsTracker />
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#0A0D12]/90 backdrop-blur-md">
        <div className={`${container} flex h-14 items-center justify-between gap-4`}>
          <Link href="/terimus" className={`flex items-center gap-2 rounded font-mono text-xs tracking-wider ${focusRing}`}>
            <span className="font-semibold text-zinc-100">TERIMUS LLC</span>
            <span className="hidden text-zinc-500 sm:inline">[CORPORATE OPERATOR]</span>
          </Link>
          <nav aria-label="TERIMUS sections" className="flex items-center gap-4 sm:gap-6">
            <a href="#portfolio" className={`hidden rounded font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-100 sm:inline ${focusRing}`}>Portfolio</a>
            <a href="#corporate" className={`hidden rounded font-mono text-xs text-zinc-400 transition-colors hover:text-zinc-100 sm:inline ${focusRing}`}>Company Info</a>
            <Link href="/" className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border border-zinc-800 px-3 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 ${focusRing}`}>
              Back to SeedEnv <span aria-hidden="true">→</span>
            </Link>
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section className={`${container} py-16 sm:py-20`}>
          <p className={metaLabel}>SeedEnv / Corporate operator &amp; governance</p>
          <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">Designing and operating focused software infrastructure.</h1>
          <p className="mt-5 max-w-2xl text-base font-normal leading-relaxed text-zinc-400 sm:text-lg">TERIMUS LLC is the corporate operator behind SeedEnv and an independent product studio building developer utilities, beta validation platforms, and consumer applications. We focus on low-noise software with deterministic execution.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#portfolio" className={`inline-flex min-h-11 items-center gap-2 rounded-lg bg-zinc-100 px-4 text-sm font-semibold text-zinc-950 transition-colors hover:bg-white ${focusRing}`}>Explore Products <ArrowRight className="size-4" aria-hidden="true" /></a>
            <a href={sunbizRecord} target="_blank" rel="noreferrer" className={`inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-800 px-4 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100 ${focusRing}`}>Verify Florida Registration <span aria-hidden="true">↗</span></a>
          </div>
        </section>

        <section id="portfolio" className="scroll-mt-14 border-t border-zinc-800/80">
          <div className={`${container} py-16 sm:py-20`}>
            <p className={metaLabel}>Portfolio</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">Active products</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {portfolio.map((item) => (
                <article key={item.title} className={`${card} flex flex-col`}>
                  <div className="flex flex-wrap content-start gap-x-1.5 gap-y-1 md:min-h-10">
                    {item.tags.map((tag) => <span key={tag} className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">[{tag}]</span>)}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-zinc-100">{item.title}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-zinc-400">{item.text}</p>
                  {item.link ? (
                    <Link href={item.link.href} className={`mt-6 inline-flex items-center gap-1.5 self-start rounded font-mono text-xs text-emerald-400 transition-colors hover:text-emerald-300 ${focusRing}`}>{item.link.label} <span aria-hidden="true">→</span></Link>
                  ) : null}
                  {item.status ? (
                    <span className="mt-6 inline-flex items-center gap-2 self-start rounded-full border border-zinc-800 px-2.5 py-1 font-mono text-xs text-zinc-300"><span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />{item.status}</span>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="corporate" className="scroll-mt-14 border-t border-zinc-800/80">
          <div className={`${container} py-16 sm:py-20`}>
            <p className={metaLabel}>Company info</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">Corporate entity &amp; governance</h2>
            <dl className="mt-8 grid gap-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 sm:grid-cols-2">
              {corporateDetails.map((item) => (
                <div key={item.label}>
                  <dt className={metaLabel}>{item.label}</dt>
                  <dd className="mt-1.5 text-sm text-zinc-100">
                    {item.href ? <a href={item.href} target={item.external ? "_blank" : undefined} rel={item.external ? "noreferrer" : undefined} className={`inline-flex items-center gap-1.5 rounded text-emerald-400 hover:text-emerald-300 ${focusRing}`}>{item.value}{item.external ? <span aria-hidden="true">↗</span> : null}</a> : item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800/80">
        <div className={`${container} flex flex-col gap-3 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between`}>
          <p>© {new Date().getFullYear()} TERIMUS LLC. All rights reserved.</p>
          <StatusPill />
        </div>
      </footer>
    </div>
  );
}
