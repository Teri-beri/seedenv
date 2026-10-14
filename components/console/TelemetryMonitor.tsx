"use client";

import { Activity, ExternalLink, LoaderCircle, Pause, Play, RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { CampaignStatus } from "@prisma/client";
import { setCohortTelemetryPause } from "@/app/actions/telemetryActions";

type MonitorCohort = { id: string; title: string; status: CampaignStatus };
type MonitorIncident = {
  id: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  statusCode: string;
  endpoint: string | null;
  deviceModel: string;
  osVersion: string;
  message: string;
  createdAt: string;
  githubIssueUrl: string | null;
  validatorHandle: string | null;
};

function severityClass(severity: MonitorIncident["severity"]) {
  if (severity === "CRITICAL") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (severity === "WARN") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-sky-500/30 bg-sky-500/10 text-sky-300";
}

export function TelemetryMonitor({
  cohorts,
  activeCohort,
  incidents,
  highlightedIncidentId,
}: {
  cohorts: MonitorCohort[];
  activeCohort: MonitorCohort | null;
  incidents: MonitorIncident[];
  highlightedIncidentId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [router]);

  function selectCohort(cohortId: string) {
    router.push(`/console/monitor?cohort=${encodeURIComponent(cohortId)}`);
  }

  function togglePause() {
    if (!activeCohort) return;
    setMessage(null);
    startTransition(async () => {
      const result = await setCohortTelemetryPause(activeCohort.id, activeCohort.status === "ACTIVE");
      setMessage(result.ok ? `Cohort ${result.status === "PAUSED" ? "paused. New claims are frozen; active sessions still stream." : "resumed. New claims are open again."}` : result.message);
      if (result.ok) router.refresh();
    });
  }

  async function exportIncident(incidentId: string) {
    setMessage(null);
    setExportingId(incidentId);
    try {
      const response = await fetch(`/api/telemetry/incidents/${encodeURIComponent(incidentId)}/export-github`, { method: "POST" });
      const result = await response.json() as { issueUrl?: string; message?: string };
      if (!response.ok || !result.issueUrl) throw new Error(result.message || "GitHub export failed.");
      setMessage("Incident exported to GitHub.");
      window.open(result.issueUrl, "_blank", "noopener,noreferrer");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "GitHub export failed.");
    } finally {
      setExportingId(null);
    }
  }

  const criticalCount = incidents.filter((incident) => incident.severity === "CRITICAL").length;
  const warningCount = incidents.filter((incident) => incident.severity === "WARN").length;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">Operational Observability</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Telemetry &amp; Incident Monitor</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Live degradation events from accepted physical tester sessions. Critical incidents dispatch email and Discord alerts immediately.</p>
          </div>
          <span className="flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-mono text-xs text-emerald-400">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70 motion-reduce:animate-none" /><span className="relative inline-flex size-2 rounded-full bg-emerald-400" /></span>
            STREAMING LIVE
          </span>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-mono uppercase tracking-[0.12em] text-zinc-500">Cohort
            <select value={activeCohort?.id || ""} onChange={(event) => selectCohort(event.target.value)} disabled={!cohorts.length} className="mt-2 w-full rounded-lg border border-zinc-800 bg-[#0A0D12] px-3 py-2.5 text-sm normal-case tracking-normal text-zinc-200 outline-none focus:border-emerald-500/50">
              {cohorts.length ? cohorts.map((cohort) => <option key={cohort.id} value={cohort.id}>{cohort.title} · {cohort.status}</option>) : <option value="">No active cohorts</option>}
            </select>
          </label>
          <button type="button" disabled={!activeCohort || isPending} onClick={togglePause} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition disabled:opacity-50 ${activeCohort?.status === "PAUSED" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15" : "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/15"}`}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : activeCohort?.status === "PAUSED" ? <Play className="size-4" /> : <Pause className="size-4" />}
            {activeCohort?.status === "PAUSED" ? "Resume Cohort Drop" : "Pause Cohort Drop"}
          </button>
          <button type="button" onClick={() => router.refresh()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-700 hover:text-white"><RefreshCw className="size-4" /> Refresh</button>
        </div>
        {message ? <p role="status" className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">{message}</p> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4"><p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">Events in feed</p><p className="mt-2 text-2xl font-semibold text-zinc-100">{incidents.length}</p></div>
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4"><p className="font-mono text-[11px] uppercase tracking-wider text-red-400">Critical</p><p className="mt-2 text-2xl font-semibold text-red-200">{criticalCount}</p></div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4"><p className="font-mono text-[11px] uppercase tracking-wider text-amber-400">Warnings</p><p className="mt-2 text-2xl font-semibold text-amber-200">{warningCount}</p></div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#080A0E]">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 font-mono text-xs text-zinc-400"><Activity className="size-4 text-emerald-400" /> INCIDENT TERMINAL</div>
          <span className="font-mono text-[10px] text-zinc-600">AUTO-REFRESH 5S</span>
        </div>
        {incidents.length ? <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left font-mono text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900/50 text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="px-4 py-3">Timestamp</th><th className="px-3 py-3">Severity</th><th className="px-3 py-3">Status code</th><th className="px-3 py-3">Hardware node</th><th className="px-3 py-3">Message / repro line</th><th className="px-4 py-3 text-right">Action</th></tr></thead>
            <tbody className="divide-y divide-zinc-900">
              {incidents.map((incident) => <tr id={`incident-${incident.id}`} key={incident.id} className={`${highlightedIncidentId === incident.id ? "bg-red-500/10 ring-1 ring-inset ring-red-500/30" : "hover:bg-zinc-900/35"}`}>
                <td className="whitespace-nowrap px-4 py-4 text-zinc-500">{new Date(incident.createdAt).toLocaleTimeString([], { hour12: false })}</td>
                <td className="px-3 py-4"><span className={`inline-flex rounded border px-2 py-1 text-[10px] font-semibold ${severityClass(incident.severity)}`}>[{incident.severity}]</span></td>
                <td className="px-3 py-4"><p className="font-semibold text-zinc-200">{incident.statusCode}</p><p className="mt-1 max-w-40 truncate text-[10px] text-zinc-600">{incident.endpoint || "runtime"}</p></td>
                <td className="px-3 py-4"><p className="text-zinc-300">{incident.deviceModel}</p><p className="mt-1 text-[10px] text-zinc-600">{incident.osVersion}{incident.validatorHandle ? ` · @${incident.validatorHandle}` : ""}</p></td>
                <td className="max-w-md px-3 py-4 leading-5 text-zinc-400">{incident.message}</td>
                <td className="px-4 py-4 text-right">{incident.githubIssueUrl ? <a href={incident.githubIssueUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300">GitHub <ExternalLink className="size-3" /></a> : <button type="button" disabled={exportingId === incident.id} onClick={() => void exportIncident(incident.id)} className="inline-flex items-center gap-1 text-zinc-300 hover:text-white disabled:opacity-50">{exportingId === incident.id ? <LoaderCircle className="size-3 animate-spin" /> : null} Export Issue ↗</button>}</td>
              </tr>)}
            </tbody>
          </table>
        </div> : <div className="grid min-h-64 place-items-center p-8 text-center"><div><TriangleAlert className="mx-auto size-8 text-zinc-700" /><p className="mt-3 text-sm font-semibold text-zinc-300">No incidents received</p><p className="mt-1 text-xs text-zinc-600">Accepted tester sessions will stream warnings and critical degradation events here.</p></div></div>}
      </section>
    </div>
  );
}
