"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ArrowRight, CheckCircle2, ChevronRight, CircleHelp, Code2, FileText, Fingerprint, Globe, Layers, LockKeyhole, Menu, Search, ShieldCheck, Smartphone, Terminal, X } from "lucide-react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useDeferredValue, useEffect, useRef, useState } from "react";
import { AnalyticsTracker, trackAnalytics } from "@/components/analytics-tracker";
import { PublicFooter } from "@/components/public-footer";
import { quoteCampaignFunding, SEEDENV_PLATFORM_FEE_PERCENT } from "@/lib/pricing";
import { availableSlots, discoverMissions, type MissionFilter } from "@/lib/tester-console";
import { formatCents } from "@/lib/utils";
import { landingViews, landingViewHref } from "@/lib/landing-views";

type Mission = {
  id: string;
  title: string;
  iconUrl: string | null;
  platform: "TESTFLIGHT" | "PLAY_STORE" | "WEB_STAGING";
  targetVibe: string;
  description: string;
  bountyPerTaskUsd: number;
  totalSlots: number;
  claimedSlots: number;
  instructions: Array<{ instructionTitle: string }>;
};

type Viewer = {
  role: "TESTER" | "DEVELOPER" | "ADMIN";
} | null;

type AuthRequest = { role: "DEVELOPER" | "TESTER"; callbackUrl: string; title: string };

const primaryAction = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400";
const secondaryAction = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#171923] px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-600 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400";
const sectionClass = "mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8";
const labelClass = "font-mono text-xs uppercase text-zinc-400";
const platformLabels = { TESTFLIGHT: "iOS / TestFlight", PLAY_STORE: "Android / Play Console", WEB_STAGING: "Web / PWA" };

const exampleCohorts = [
  { title: "iOS 18 TestFlight", scope: "Auth flow stress test & deep-link telemetry", platform: "iOS", stipend: "$15.00", slots: "18 / 25", progress: 72 },
  { title: "Next.js PWA", scope: "Stripe checkout edge cases on Safari", platform: "Web", stipend: "$10.00", slots: "12 / 20", progress: 60 },
];

const reportPreview = JSON.stringify({
  device: "iPhone 15 Pro",
  os: "iOS 18.0",
  build: "1.4.0 (42)",
  scenario: "Session recovery after a deep link",
  steps: ["Open invitation link", "Complete sign-in", "Return to the invitation"],
  expected: "Invitation remains available",
  observed: "Redirect returns to the home screen",
  attachments: ["reproduction.mp4", "network.har", "crash.log"],
}, null, 2);

export function PublicLanding({ missions, viewer, directoryUnavailable = false }: { missions: Mission[]; viewer: Viewer; directoryUnavailable?: boolean }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [authRequest, setAuthRequest] = useState<AuthRequest | null>(null);
  const preferredAccessRef = useRef<HTMLAnchorElement>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MissionFilter>("all");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [activeAnchor, setActiveAnchor] = useState("top");
  useEffect(() => {
    let frameId: number | null = null;
    const syncAnchor = () => setActiveAnchor(window.location.hash.slice(1) || "top");
    const syncScroll = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        let current = "top";
        for (const item of landingViews) {
          if (item.anchor === "top") continue;
          const section = document.getElementById(item.anchor);
          if (section && section.getBoundingClientRect().top <= 130) current = item.anchor;
        }
        setActiveAnchor(current);
        frameId = null;
      });
    };
    syncAnchor();
    syncScroll();
    window.addEventListener("hashchange", syncAnchor);
    window.addEventListener("scroll", syncScroll, { passive: true });
    window.addEventListener("resize", syncScroll);
    return () => {
      window.removeEventListener("hashchange", syncAnchor);
      window.removeEventListener("scroll", syncScroll);
      window.removeEventListener("resize", syncScroll);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);
  const accessRoles = authRequest?.role === "TESTER" ? (["TESTER", "DEVELOPER"] as const) : (["DEVELOPER", "TESTER"] as const);
  const deferredQuery = useDeferredValue(query);
  const visibleMissions = discoverMissions(missions, deferredQuery, filter, "reward");
  const role = viewer?.role ?? session?.user?.role;
  const signedIn = Boolean(viewer) || status === "authenticated";
  const workspaceHref = role === "DEVELOPER" ? "/console" : role === "ADMIN" ? "/admin" : "/dashboard";
  const developerHref = signedIn
    ? role === "DEVELOPER" || role === "ADMIN" ? "/console?view=new-drop" : "/account"
    : "/auth/signin?role=DEVELOPER&callbackUrl=%2Fconsole%3Fview%3Dnew-drop";

  function requestAccess(request: AuthRequest) {
    trackAnalytics("cta_click", { action: request.title, callbackUrl: request.callbackUrl });
    if (signedIn && (role === request.role || role === "ADMIN")) {
      router.push(request.callbackUrl);
      return;
    }
    setAuthRequest(request);
  }

  return (
    <div id="top" className="min-h-screen text-white [color-scheme:dark]">
      <AnalyticsTracker />
      <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-[#0A0D12]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-h-11 shrink-0 items-center gap-2 sm:gap-3" aria-label="SeedEnv home">
            <Image src="/seedenv-logo-v3.png" alt="" width={36} height={36} className="size-8 shrink-0 object-contain sm:size-9" priority />
            <span className="text-base font-semibold sm:text-lg">SeedEnv</span>
            <span className="font-mono text-[10px] text-zinc-500 sm:text-xs">v1.2</span>
          </Link>
          <nav aria-label="Landing sections" className="hidden min-w-0 items-center justify-center gap-1 xl:flex">
            {landingViews.map((item) => <Link key={item.id} href={landingViewHref(item.id)} onClick={() => setActiveAnchor(item.anchor)} aria-current={activeAnchor === item.anchor ? "location" : undefined} className={`inline-flex min-h-11 shrink-0 items-center rounded-lg px-2.5 text-sm transition-colors ${activeAnchor === item.anchor ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}>{item.label}</Link>)}
          </nav>
          <nav className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0" aria-label="Landing actions">
            {signedIn ? <Link href={workspaceHref} className={secondaryAction}>Console <ArrowRight className="hidden size-4 sm:block" /></Link> : (
              <button type="button" className={secondaryAction} onClick={() => setAuthRequest({ role: "DEVELOPER", callbackUrl: "/console?view=new-drop", title: "Access SeedEnv" })}>Sign In <ArrowRight className="hidden size-4 sm:block" /></button>
            )}
            <span className="hidden sm:inline-flex"><Link href={developerHref} className={primaryAction}>Deploy a Cohort <ArrowRight className="size-4" /></Link></span>
            <button type="button" aria-label={mobileNavigationOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileNavigationOpen} aria-controls="landing-mobile-navigation" className="grid size-11 place-items-center rounded-lg border border-white/10 text-zinc-300 xl:hidden" onClick={() => setMobileNavigationOpen((open) => !open)}>{mobileNavigationOpen ? <X className="size-5" /> : <Menu className="size-5" />}</button>
            <span className="hidden lg:inline-flex"><Link href="/community" className={secondaryAction}>Launch Circle</Link></span>
          </nav>
        </div>
        {mobileNavigationOpen ? <nav id="landing-mobile-navigation" aria-label="Mobile landing sections" className="grid grid-cols-2 gap-2 border-t border-white/10 px-4 py-3 sm:px-6 xl:hidden">{landingViews.map((item) => <Link key={item.id} href={landingViewHref(item.id)} onClick={() => { setMobileNavigationOpen(false); setActiveAnchor(item.anchor); }} aria-current={activeAnchor === item.anchor ? "location" : undefined} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-sm ${activeAnchor === item.anchor ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}>{item.label}</Link>)}<Link href={developerHref} className={`${primaryAction} col-span-2 sm:hidden`} onClick={() => setMobileNavigationOpen(false)}>Deploy a Cohort <ArrowRight className="size-4" /></Link><Link href="/community" className={`${secondaryAction} col-span-2 lg:hidden`} onClick={() => setMobileNavigationOpen(false)}>Launch Circle <ArrowRight className="size-4" /></Link></nav> : null}
      </header>

      <main className="terminal-grid">
        <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg,rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "44px 44px" }}>
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 font-mono text-xs text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              {missions.length ? "Cohorts Live" : "Pre-launch validation"}
            </div>
            <h1 className="mt-4 max-w-5xl text-4xl font-semibold leading-tight text-white md:text-5xl">Human validation infrastructure for pre-launch mobile &amp; web apps.</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-400">Production-grade human testing cohorts before public App Store distribution. Define scenarios and review real-device evidence.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={developerHref} className={primaryAction} onClick={() => trackAnalytics("signup_start", { role: "DEVELOPER", callbackUrl: "/console?view=new-drop" })}>Deploy a Cohort <ArrowRight className="size-4" /></Link>
              <Link href={landingViewHref("cohorts")} className={secondaryAction}>Explore Live Board <ChevronRight className="size-4" /></Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 font-mono text-xs text-zinc-400">
              <span className="flex items-center gap-2"><Smartphone className="size-4 text-emerald-400" /> TestFlight / Play Console</span>
              <span className="flex items-center gap-2"><Globe className="size-4 text-emerald-400" /> Web / PWA</span>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8" aria-label="Live validation showcase"><LiveShowcase /></section>
        <section id="engine" className="scroll-mt-4 border-t border-zinc-800/80 bg-[#12161F]/40">
          <div className={sectionClass}>
            <p className={labelClass}>For developers</p>
            <h2 className="mt-3 text-xl font-semibold text-zinc-100 sm:text-2xl">A validation pipeline, not a comment box.</h2>
            <div className="mt-8 grid gap-8 md:grid-cols-3">
              <WorkflowStep number="01" icon={<Code2 className="size-5" />} title="Define Test Scenarios" text="Provide a TestFlight, Play Console, or web build. Specify target devices and acceptance criteria in your brief, then choose focused testing scenarios." />
              <WorkflowStep number="02" icon={<LockKeyhole className="size-5" />} title="Escrow & Automated Distribution" text="Fund tester rewards with a transparent 5% add-on platform fee. Reviewed, approved submissions enter the Stripe transfer workflow; payment status stays visible." />
              <WorkflowStep number="03" icon={<FileText className="size-5" />} title="Structured Reports & Export" text="Review reproduction videos, device context, and crash or network logs when provided. Export approved proof and attach reproducible evidence to your GitHub issues or release tracker." />
            </div>
          </div>
        </section>
        <section id="validators" className="scroll-mt-4 border-t border-zinc-800/80"><div className={sectionClass}>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div><p className={labelClass}>For validators</p><h2 className="mt-3 text-xl font-semibold text-zinc-100 sm:text-2xl">Progression &amp; Verification Protocol</h2></div>
            <button type="button" className={secondaryAction} onClick={() => requestAccess({ role: "TESTER", callbackUrl: "/dashboard", title: "Become a Validator" })}>Become a Validator <ArrowRight className="size-4" /></button>
          </div>
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            <WorkflowStep number="01" icon={<ShieldCheck className="size-5" />} title="Hardware & Technical Onboarding" text="Record your device, OS, and testing background. Include reproducible, original evidence from the hardware required by the cohort; hardware details are reviewed rather than assumed verified." />
            <WorkflowStep number="02" icon={<Layers className="size-5" />} title="Verified Milestones" text="Build reputation through reviewed submissions and useful technical evidence. Scenario eligibility is checked automatically; Discovery Pass rules remain explicit." />
            <WorkflowStep number="03" icon={<CheckCircle2 className="size-5" />} title="Escrow-backed Stipends" text="See the reward and acceptance criteria before applying. Approved work enters the payout ledger; a successful Stripe transfer completes payment. Payout setup is required." />
          </div>
          <div className="mt-10 grid gap-6 border-t border-white/10 pt-7 md:grid-cols-3">
            {[
              ["Tier 1: Functional Checks", "First-run flows, visual hierarchy, and supported-device fit."],
              ["Tier 2: Scenario & Log Audits", "Session recovery, authentication, sandbox payments, and reproducible bugs."],
              ["Tier 3: Pre-Submission Hardening", "Release-focused validation briefs and store-readiness evidence."],
            ].map(([title, text]) => <div key={title}><p className="font-mono text-xs text-emerald-400">{title}</p><p className="mt-3 text-sm leading-6 text-zinc-400">{text}</p></div>)}
          </div>
        </div></section>

        <section id="cohorts" className="scroll-mt-4 border-t border-zinc-800/80 bg-[#12161F]/40">
          <div className={sectionClass}>
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div><p className={labelClass}>Validation Board</p><h2 className="mt-3 text-xl font-semibold text-zinc-100 sm:text-2xl">Active Cohorts</h2></div>
              <span className="font-mono text-xs text-zinc-400">{directoryUnavailable ? "Directory counts unavailable" : `${missions.length} cohorts / ${missions.reduce((count, mission) => count + availableSlots(mission), 0)} open slots`}</span>
            </div>
            <div className="mt-7 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <label className="relative block w-full md:max-w-sm"><span className="sr-only">Search cohorts</span><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-zinc-500" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps or scenarios" className="min-h-11 w-full rounded-lg border border-white/10 bg-[#0F1117] py-2 pl-10 pr-3 text-sm text-white outline-none focus:border-emerald-400" /></label>
              <div className="grid grid-cols-4 gap-1 rounded-lg border border-white/10 bg-[#0F1117] p-1" role="group" aria-label="Cohort platform filter">
                {([['all', 'All'], ['TESTFLIGHT', 'iOS TestFlight'], ['PLAY_STORE', 'Android Play Internal'], ['WEB_STAGING', 'Web PWA']] as const).map(([value, title]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-11 rounded-md px-2 py-2 text-xs leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:px-3 sm:text-sm ${filter === value ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"}`}>{title}</button>)}
              </div>
            </div>
            {visibleMissions.length ? (
              <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800/80"><table className="w-full min-w-[850px] text-left text-sm" aria-label="Live cohort directory"><thead className="bg-[#12161F] text-zinc-400"><tr>{["App / Target OS", "Test Scenario", "Validator Stipend", "Available Slots", "Participation"].map((label) => <th key={label} scope="col" className="px-4 py-4 font-mono text-xs font-normal uppercase">{label}</th>)}</tr></thead><tbody className="divide-y divide-zinc-800/80">{visibleMissions.map((mission) => <CohortRow key={mission.id} mission={mission} signedIn={signedIn && (role === "TESTER" || role === "ADMIN")} onJoin={() => requestAccess({ role: "TESTER", callbackUrl: `/dashboard?claim=${encodeURIComponent(mission.id)}`, title: `Join ${mission.title}` })} />)}</tbody></table></div>
            ) : (
              <div className="mt-6 border-y border-white/10 py-10 text-center" role="status">
                <p className="text-sm font-medium text-zinc-200">{directoryUnavailable ? "Cohort directory temporarily unavailable" : missions.length ? "No cohorts match these filters" : "No cohorts are currently accepting applications"}</p>
                <p className="mt-2 text-sm text-zinc-400">{directoryUnavailable ? "Please check back shortly. The example report above remains available." : missions.length ? "Try another platform or search term." : "New cohorts appear here when funding and activation are complete."}</p>
                {missions.length > 0 ? <button type="button" className={`${secondaryAction} mt-4`} onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button> : null}
              </div>
            )}
          </div>
        </section>
        <DeveloperPricing href={developerHref} />

        <section id="pwa" className="scroll-mt-4 border-t border-zinc-800/80 bg-[#12161F]/40">
          <div className={`${sectionClass} flex flex-wrap items-center justify-between gap-6`}>
            <div><p className={labelClass}>Mobile & web</p><h2 className="mt-3 text-xl font-semibold text-zinc-100 sm:text-2xl">SeedEnv Mobile Console (PWA)</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">A browser-based workspace for reviewing scenarios, submitting evidence, and tracking verification.</p></div>
            <button type="button" className={secondaryAction} onClick={() => requestAccess({ role: "TESTER", callbackUrl: "/dashboard", title: "Open validator console" })}>Open Console <ArrowRight className="size-4" /></button>
            <MobileSetupGuide />
          </div>
        </section>
      </main>

      <PublicFooter />

      <Dialog.Root open={authRequest !== null} onOpenChange={(open) => { if (!open) setAuthRequest(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          <Dialog.Content onOpenAutoFocus={(event) => { event.preventDefault(); preferredAccessRef.current?.focus(); }} className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-[#171923] p-6 text-white shadow-xl focus:outline-none">
            <Dialog.Title className="break-words pr-8 text-xl font-semibold">{authRequest?.title || "Access SeedEnv"}</Dialog.Title>
            <Dialog.Description className="mt-3 text-sm leading-6 text-zinc-400">{signedIn ? "This action requires the corresponding workspace. Manage your account access before continuing." : "Choose the workspace for this action. Cohort participation requires a tester account; campaign funding requires a developer account."}</Dialog.Description>
            {signedIn ? <Link ref={preferredAccessRef} href="/account" className={`${primaryAction} mt-5 w-full`}>Manage workspace access <ArrowRight className="size-4" /></Link> : (
              <div className="mt-5 grid gap-3">
                {accessRoles.map((accountRole) => {
                  const callbackUrl = accountRole === authRequest?.role ? authRequest.callbackUrl : accountRole === "DEVELOPER" ? "/console?view=new-drop" : "/dashboard";
                  return <Link ref={accountRole === authRequest?.role ? preferredAccessRef : undefined} key={accountRole} href={`/auth/signin?role=${accountRole}&callbackUrl=${encodeURIComponent(callbackUrl)}`} className={accountRole === authRequest?.role ? primaryAction : secondaryAction} onClick={() => trackAnalytics("signup_start", { role: accountRole, callbackUrl })}>{accountRole === "DEVELOPER" ? "Continue as Developer" : "Continue as Tester"}<ArrowRight className="size-4" /></Link>;
                })}
              </div>
            )}
            <Dialog.Close asChild><button type="button" aria-label="Close sign-in dialog" className="absolute right-3 top-3 grid size-11 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="size-5" /></button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function LiveShowcase() {
  const [tab, setTab] = useState<"cohorts" | "report">("cohorts");
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-[#171923]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><span className={`${labelClass} flex items-center gap-2`}><Terminal className="size-4 text-emerald-400" /> Live Telemetry &amp; Cohort Feed</span><span className="font-mono text-[11px] text-zinc-500">EXAMPLE DATA</span></div>
      <div className="grid grid-cols-2 border-b border-white/10" role="tablist" aria-label="Validation showcase">
        {([['cohorts', 'Live Cohorts Preview'], ['report', 'Telemetry & Report Preview']] as const).map(([value, title]) => (
          <button type="button" key={value} id={`showcase-tab-${value}`} role="tab" aria-selected={tab === value} aria-controls={`showcase-panel-${value}`} onClick={() => setTab(value)} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); const nextTab = tab === "cohorts" ? "report" : "cohorts"; setTab(nextTab); document.getElementById(`showcase-tab-${nextTab}`)?.focus(); } }} tabIndex={tab === value ? 0 : -1} className={`min-h-14 px-3 py-3 text-xs font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${tab === value ? "border-b-2 border-emerald-400 bg-[#0F1117] text-white" : "text-zinc-400 hover:text-white"}`}>{title}</button>
        ))}
      </div>
      <div className="h-[360px] overflow-auto max-[359px]:h-[420px] md:h-[260px]">
        {tab === "cohorts" ? (
          <div id="showcase-panel-cohorts" role="tabpanel" aria-labelledby="showcase-tab-cohorts" className="grid gap-3 p-3 pb-5 sm:gap-4 sm:p-4 sm:pb-6 md:grid-cols-2">
            {exampleCohorts.map((cohort) => (
              <div key={cohort.title} className="min-w-0 rounded-lg border border-white/10 bg-[#0F1117] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4"><p className="text-sm font-semibold text-white">{cohort.title}</p><span className="border border-white/10 px-2 py-1 font-mono text-[11px] text-emerald-300">{cohort.platform}</span></div>
                <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">{cohort.scope}</p>
                <div className="mt-4 flex items-center justify-between gap-3 font-mono text-xs"><span className="text-amber-300">{cohort.stipend} / validator</span><span className="text-zinc-400">{cohort.slots} slots filled</span></div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-sm bg-zinc-800" role="progressbar" aria-label={`${cohort.title} example slots filled`} aria-valuenow={cohort.progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-emerald-500" style={{ width: `${cohort.progress}%` }} /></div>
              </div>
            ))}
          </div>
        ) : <div id="showcase-panel-report" role="tabpanel" aria-labelledby="showcase-tab-report" className="p-5"><div className="mb-4 flex items-center justify-between gap-3 font-mono text-xs"><span className="text-zinc-400">report.json</span><span className="text-emerald-400">Reproducible evidence</span></div><pre className="max-h-[255px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 text-zinc-300"><code>{reportPreview}</code></pre></div>}
      </div>
    </div>
  );
}

function WorkflowStep({ number, icon, title, text }: { number: string; icon: ReactNode; title: string; text: string }) {
  return <div className="min-w-0"><div className="flex items-center justify-between border-b border-white/10 pb-4"><span className="font-mono text-xs text-zinc-500">{number}</span><span className="text-emerald-400">{icon}</span></div><h3 className="mt-5 text-base font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-7 text-zinc-400">{text}</p></div>;
}

function CohortRow({ mission, signedIn, onJoin }: { mission: Mission; signedIn: boolean; onJoin: () => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const slots = availableSlots(mission);
  let iconUrl = "";
  try { const url = new URL(mission.iconUrl || ""); if (url.protocol === "https:" || url.protocol === "http:") iconUrl = url.toString(); } catch { iconUrl = ""; }
  return (
    <tr className="bg-[#0A0D12] transition-colors hover:bg-[#12161F]">
      <td className="w-64 px-4 py-5"><div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-[#0F1117]">{iconUrl && !imageFailed ? <Image src={iconUrl} alt="" width={44} height={44} className="size-11 object-cover" unoptimized onError={() => setImageFailed(true)} /> : mission.platform === "WEB_STAGING" ? <Globe className="size-5 text-zinc-400" /> : <Smartphone className="size-5 text-zinc-400" />}</span>
        <div className="min-w-0"><h3 className="break-words text-base font-semibold text-white">{mission.title}</h3><p className="mt-1 font-mono text-xs text-emerald-400">{platformLabels[mission.platform]}</p></div>
      </div></td>
      <td className="max-w-sm px-4 py-5"><p className="line-clamp-2 text-sm leading-6 text-zinc-200">{mission.instructions.map((item) => item.instructionTitle).join(" / ") || "Acceptance criteria in the cohort brief"}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{mission.description}</p></td>
      <td className="whitespace-nowrap px-4 py-5"><span className="font-mono text-base text-amber-300">{formatCents(Math.round(mission.bountyPerTaskUsd * 100))}</span><p className="mt-2 text-xs text-zinc-500">Per approved report</p></td>
      <td className="whitespace-nowrap px-4 py-5 font-mono text-xs text-zinc-400">{slots} / {mission.totalSlots}</td>
      <td className="px-4 py-5"><button type="button" disabled={slots === 0} className={`${secondaryAction} whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50`} onClick={onJoin}>{slots === 0 ? "Cohort full" : signedIn ? "Join Cohort" : "Sign in to Claim"}<ArrowRight className="size-4" /></button></td>
    </tr>
  );
}

function DeveloperPricing({ href }: { href: string }) {
  const [pool, setPool] = useState(300);
  const funding = quoteCampaignFunding(pool);
  return (
    <section id="pricing" className="scroll-mt-4 border-t border-zinc-800/80"><div className={sectionClass}>
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <p className={labelClass}>Transparent pricing</p><h2 className="mt-3 text-xl font-semibold text-zinc-100 sm:text-2xl">Fund the work. Keep the math visible.</h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-400">The full tester reward pool is allocated to approved work. SeedEnv adds a {SEEDENV_PLATFORM_FEE_PERCENT * 100}% platform fee on that pool. Stripe processing or payout fees, where applicable, are separate.</p>
          <Tooltip.Provider delayDuration={150}><div className="mt-6 divide-y divide-white/10 border-y border-white/10">
            <PricingFeature icon={<Layers className="size-4" />} title="Zero monthly seat subscription" text="Fund individual campaigns rather than paying a monthly subscription for each team seat." />
            <PricingFeature icon={<LockKeyhole className="size-4" />} title="Escrow protection" text="Campaign funding precedes activation. Submitted evidence is reviewed against the agreed criteria before rewards enter the payout workflow." />
            <PricingFeature icon={<Fingerprint className="size-4" />} title="Device metadata & fraud filtering" text="Device context, server-side proof hashing, and duplicate-evidence checks support review. Device signals are not a guarantee of identity or fraud prevention." />
          </div></Tooltip.Provider>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-[#12161F] p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4"><label htmlFor="tester-reward-pool" className="text-sm font-medium text-zinc-200">Tester reward pool (USD)</label><input id="tester-reward-pool" type="number" min={100} max={5000} step={25} value={pool} onChange={(event) => setPool(Math.min(5000, Math.max(100, Number(event.target.value) || 100)))} className="min-h-11 w-28 rounded-lg border border-white/10 bg-[#0F1117] px-3 py-2 text-right font-mono text-sm text-white outline-none focus:border-emerald-400" /></div>
          <input type="range" min={100} max={5000} step={25} value={pool} aria-label="Tester reward pool slider" onChange={(event) => setPool(Number(event.target.value))} className="mt-5 min-h-11 w-full accent-emerald-500" />
          <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-5 text-sm"><dt className="text-zinc-400">Tester reward pool</dt><dd className="font-mono text-emerald-400">{formatCents(Math.round(funding.payoutPoolUsd * 100))}</dd><dt className="text-zinc-400">{SEEDENV_PLATFORM_FEE_PERCENT * 100}% platform fee</dt><dd className="font-mono text-zinc-200">{formatCents(Math.round(funding.platformFeeUsd * 100))}</dd><dt className="border-t border-white/10 pt-5 font-medium text-white">Total cohort funding</dt><dd className="border-t border-white/10 pt-5 font-mono font-medium text-amber-300">{formatCents(funding.escrowTotalCents)}</dd></dl>
          <Link href={href} className={`${primaryAction} mt-7 w-full`}>Deploy a Cohort <ArrowRight className="size-4" /></Link>
        </div>
      </div>
    </div></section>
  );
}

function PricingFeature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <div className="flex items-center gap-3 py-3 text-sm text-zinc-300"><span className="text-zinc-500">{icon}</span><span className="min-w-0 flex-1">{title}</span><Tooltip.Root><Tooltip.Trigger asChild><button type="button" aria-label={`About ${title}`} className="grid size-11 shrink-0 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-800 hover:text-white"><CircleHelp className="size-4" /></button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content sideOffset={6} className="z-50 max-w-[min(300px,calc(100vw-2rem))] rounded-lg border border-white/10 bg-[#171923] px-4 py-3 text-xs leading-6 text-zinc-200 shadow-lg">{text}<Tooltip.Arrow className="fill-zinc-700" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root></div>;
}

function MobileSetupGuide() {
  const [platform, setPlatform] = useState<"ios" | "android">("ios");
  const steps = platform === "ios"
    ? [["Open in Safari", "Open seedenv.com directly in Safari on your iPhone or iPad."], ["Add to Home Screen", "Open Share and choose Add to Home Screen from the action menu."], ["Open SeedEnv", "Confirm Add, then launch SeedEnv from the Home Screen and sign in to your workspace."]]
    : [["Open in Chrome", "Open seedenv.com directly in Chrome on your Android device."], ["Install the console", "Open Chrome's menu and choose Install app or Add to Home screen."], ["Open SeedEnv", "Confirm installation, then launch SeedEnv and sign in to your workspace."]];
  return <div className="w-full border-t border-zinc-800/80 pt-7"><div className="inline-grid grid-cols-2 rounded-lg border border-zinc-800 bg-[#0A0D12] p-1" role="group" aria-label="PWA setup platform">{(["ios", "android"] as const).map((value) => <button key={value} type="button" aria-pressed={platform === value} className={`min-h-11 rounded-md px-4 text-sm ${platform === value ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-white"}`} onClick={() => setPlatform(value)}>{value === "ios" ? "iOS / Safari" : "Android / Chrome"}</button>)}</div><ol className="mt-6 grid gap-6 md:grid-cols-3" aria-label={`${platform === "ios" ? "iOS" : "Android"} installation steps`}>{steps.map(([title, detail], index) => <li key={title}><span className="font-mono text-xs text-emerald-400">0{index + 1}</span><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-2 text-sm leading-7 text-zinc-400">{detail}</p></li>)}</ol></div>;
}