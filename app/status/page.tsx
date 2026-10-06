import type { Metadata } from "next";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { PublicFooter } from "@/components/public-footer";
import { getSystemStatus, type ServiceState } from "@/lib/system-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "System Status",
  description: "Live health of SeedEnv core API, payments, telemetry processing, and notifications.",
  alternates: { canonical: "/status" },
};

function StateBadge({ state }: { state: ServiceState }) {
  const operational = state === "operational";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-xs ${operational ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/25 bg-amber-500/10 text-amber-300"}`}>
      <span aria-hidden="true">●</span>
      {operational ? "Operational" : "Degraded"}
    </span>
  );
}

export default async function StatusPage() {
  const status = await getSystemStatus();
  const operational = status.overall === "operational";
  const checkedAt = new Date(status.checkedAt);
  const checkedLabel = `${checkedAt.toISOString().slice(0, 19).replace("T", " ")} UTC`;

  return (
    <div className="min-h-screen bg-[#0A0D12] text-white [color-scheme:dark]">
      <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <BackButton fallbackHref="/" className="-ml-1 mb-2" />
        <nav aria-label="Breadcrumb" className="font-mono text-xs text-zinc-500">
          <ol className="flex items-center gap-2">
            <li><Link href="/" className="inline-flex min-h-11 items-center hover:text-zinc-200">SeedEnv</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-zinc-300">System Status</li>
          </ol>
        </nav>

        <section
          aria-live="polite"
          className={`mt-4 flex flex-col gap-3 rounded-lg border p-5 sm:flex-row sm:items-center sm:justify-between ${operational ? "border-emerald-500/20 bg-emerald-500/10" : "border-amber-500/25 bg-amber-500/10"}`}
        >
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="relative flex size-3 shrink-0">
              {operational ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" /> : null}
              <span className={`relative inline-flex size-3 rounded-full ${operational ? "bg-emerald-400" : "bg-amber-400"}`} />
            </span>
            <h1 className={`text-lg font-semibold sm:text-xl ${operational ? "text-emerald-100" : "text-amber-100"}`}>
              {operational ? "All Core Systems Fully Operational" : "Some Systems Are Degraded"}
            </h1>
          </div>
          <p className="font-mono text-xs text-zinc-400">
            Last checked <time dateTime={status.checkedAt}>{checkedLabel}</time>
          </p>
        </section>

        <section aria-labelledby="services-heading" className="mt-10">
          <h2 id="services-heading" className="font-mono text-xs uppercase tracking-wider text-zinc-400">Core Services</h2>
          <ul className="mt-4 divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-[#0F1117]">
            {status.services.map((service) => (
              <li key={service.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-100 sm:text-base">{service.name}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-zinc-400">{service.description}</p>
                </div>
                <StateBadge state={service.state} />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-6 text-zinc-500">
            Status reflects live checks run when this page loads (refreshed at most every 30 seconds). Historical uptime will appear here once monitoring history is recorded.
          </p>
        </section>

        <section aria-labelledby="incidents-heading" className="mt-10">
          <h2 id="incidents-heading" className="font-mono text-xs uppercase tracking-wider text-zinc-400">Incident History (Last 30 Days)</h2>
          <div className="mt-4 rounded-lg border border-white/10 bg-[#0F1117] p-5 text-sm leading-6 text-zinc-400">
            No incidents have been posted in the last 30 days. Report a problem through Support &amp; Feedback or email{" "}
            <a href="mailto:terimus@seedenv.com" className="text-emerald-300 hover:text-emerald-200">terimus@seedenv.com</a>.
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
