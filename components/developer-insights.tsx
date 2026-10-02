"use client";

import { SubmissionStatus } from "@prisma/client";
import {
  Clipboard,
  ClipboardCopy,
  Code2,
  Download,
  ExternalLink,
  FileJson,
  Filter,
  Link2,
  Play,
  Send,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import { useMemo, useState, useSyncExternalStore } from "react";

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
  status: SubmissionStatus;
  rejectionReason: string | null;
  createdAt: Date;
  tester: { username: string; avatarUrl: string | null };
  campaign: { id: string; title: string };
};

type ResourceCategory =
  "All" | "User Acquisition" | "UGC & Content" | "Analytics & SDKs" | "ASO";
type ReportFilter = "All" | "Pending Review" | "Flagged" | "Approved";

const resources = [
  {
    name: "Seed a tester cohort",
    category: "UGC & Content" as const,
    description:
      "Create a drop, define tester tasks, and fund a vetted launch cohort.",
    perk: "Open launch wizard",
    href: "/console?view=new-drop",
    icon: Play,
  },
  {
    name: "Google App Campaigns",
    category: "User Acquisition" as const,
    description:
      "A practical setup checklist for conversion events, deep links, and campaign measurement.",
    perk: "Free tracking review",
    href: "https://support.google.com/google-ads/answer/6247380",
    icon: ExternalLink,
  },
  {
    name: "Sentry + PostHog",
    category: "Analytics & SDKs" as const,
    description:
      "Pair crash visibility with product analytics so tester findings become measurable fixes.",
    perk: "Telemetry starter pack",
    href: "https://sentry.io/",
    icon: Code2,
  },
  {
    name: "App Store Review Guidelines",
    category: "ASO" as const,
    description:
      "Review Apple's current requirements before submitting your app or beta build.",
    perk: "Official Apple guidance",
    href: "https://developer.apple.com/app-store/review/guidelines/",
    icon: ShieldCheck,
  },
  {
    name: "TikTok Spark Ads",
    category: "User Acquisition" as const,
    description:
      "Turn authentic creator posts into permissioned paid acquisition creative.",
    perk: "Creative audit included",
    href: "https://ads.tiktok.com/business/creativecenter",
    icon: Send,
  },
  {
    name: "Supabase Platform",
    category: "Analytics & SDKs" as const,
    description:
      "Managed Postgres, authentication, storage, and edge functions for app backends.",
    perk: "Backend platform",
    href: "https://supabase.com/docs",
    icon: Link2,
  },
];
type Resource = (typeof resources)[number];

function parseField(text: string, label: string) {
  const match = text.match(new RegExp(`${label}\\s*[:=-]\\s*(.+)`, "i"));
  return match?.[1]?.split("\\n")[0]?.trim() || "Not captured";
}

function getSeverity(text: string) {
  const lower = text.toLowerCase();
  if (/(crash|blocked|data loss|cannot launch)/.test(lower))
    return {
      label: "Critical / Crash",
      className: "border-red-400/30 bg-red-500/10 text-red-200",
    };
  if (/(layout|visual|overlap|responsive|button)/.test(lower))
    return {
      label: "UI / Layout Glitch",
      className: "border-violet-400/30 bg-violet-500/10 text-violet-200",
    };
  if (/(request|would be useful|please add)/.test(lower))
    return {
      label: "Feature Request",
      className: "border-blue-400/30 bg-blue-500/10 text-blue-200",
    };
  return {
    label: "Friction / UX Bottleneck",
    className: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  };
}

function isFlaggedSubmission(submission: InsightSubmission) {
  return Boolean(
    submission.rejectionReason ||
    submission.crashLogs?.trim() ||
    getSeverity(submission.feedbackText || "").label === "Critical / Crash",
  );
}

export function DeveloperInsights({
  submissions,
}: {
  submissions: InsightSubmission[];
}) {
  const [selectedId, setSelectedId] = useState(submissions[0]?.id || "");
  const [tab, setTab] = useState<"telemetry" | "compliance" | "ecosystem">(
    "telemetry",
  );
  const [reportFilter, setReportFilter] = useState<ReportFilter>("All");
  const [resourceFilter, setResourceFilter] = useState<ResourceCategory>("All");
  const [logOpen, setLogOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const filteredSubmissions = useMemo(
    () =>
      submissions.filter((submission) => {
        if (reportFilter === "Pending Review")
          return submission.status === SubmissionStatus.PENDING;
        if (reportFilter === "Approved")
          return submission.status === SubmissionStatus.APPROVED;
        if (reportFilter === "Flagged") return isFlaggedSubmission(submission);
        return true;
      }),
    [reportFilter, submissions],
  );
  const selected =
    filteredSubmissions.find((submission) => submission.id === selectedId) ||
    filteredSubmissions[0];
  const visibleSelectedId = selected?.id || "";
  const feedback =
    selected?.feedbackText || "No structured feedback has been submitted yet.";
  const severityDetails = getSeverity(feedback);
  const severity = selected
    ? {
        ...severityDetails,
        label: `${selected.status.toLowerCase().replaceAll("_", " ")} · ${severityDetails.label}`,
      }
    : severityDetails;
  const filteredResources = resources.filter(
    (resource) =>
      resourceFilter === "All" || resource.category === resourceFilter,
  );
  const telemetry = useMemo(
    () => ({
      os: selected?.osBuild || parseField(feedback, "OS"),
      device: selected?.deviceModel || parseField(feedback, "Device"),
      resolution:
        selected?.screenResolution || parseField(feedback, "Resolution"),
      build: selected?.appBuildVersion || parseField(feedback, "Build"),
      network: selected?.networkType || parseField(feedback, "Network"),
      sessionDuration: "Not captured",
    }),
    [feedback, selected],
  );

  function exportTelemetry() {
    if (!selected) return;
    const payload = {
      submissionId: selected.id,
      campaign: selected.campaign.title,
      tester: selected.tester.username,
      payoutCents: selected.payoutCents,
      telemetry,
      crashLogs: selected.crashLogs,
      networkLogs: selected.networkLogs,
      recordingUrl: selected.recordingUrl,
      feedback,
      exportedAt: new Date().toISOString(),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `seedenv-telemetry-${selected.id}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyDiagnosticPayload() {
    if (!selected) return;
    const payload = {
      submissionId: selected.id,
      campaign: selected.campaign.title,
      tester: selected.tester.username,
      status: selected.status,
      submittedAt: selected.createdAt.toISOString(),
      deviceSpecs: {
        osVersion: telemetry.os,
        deviceModel: telemetry.device,
        screenResolution: telemetry.resolution,
        sessionDuration: "Not captured",
        appBuild: telemetry.build,
        network: telemetry.network,
      },
      feedback,
      crashLogs: selected.crashLogs,
      networkLogs: selected.networkLogs,
      recordingUrl: selected.recordingUrl,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setNotice("Diagnostic payload JSON copied to clipboard.");
    } catch {
      setNotice(
        "Clipboard access failed. Allow clipboard permission and try again.",
      );
    }
  }

  async function copyIssue(target: "GitHub" | "Linear" | "logs") {
    const content =
      target === "logs"
        ? "No crash or network logs were attached to this submission."
        : `## ${selected?.campaign.title || "SeedEnv finding"}\n\n**Tester:** ${selected?.tester.username || "Unknown"}\n**Severity:** ${severity.label}\n**Expected:** ${parseField(feedback, "Expected")}\n**Actual:** ${parseField(feedback, "Actual")}\n\n### Feedback\n${feedback}`;
    try {
      await navigator.clipboard.writeText(content);
      setNotice(
        `${target === "logs" ? "Logs" : `${target} issue`} markdown copied to clipboard.`,
      );
    } catch {
      setNotice(
        "Clipboard access failed. Allow clipboard permission and try again.",
      );
    }
  }

  return (
    <section className="space-y-5" aria-label="Developer insights">
      <div
        className="flex max-w-full gap-5 overflow-x-auto border-b border-white/10"
        role="tablist"
        aria-label="Developer workspace views"
      >
        {(
          [
            ["telemetry", "Audit Hub"],
            ["compliance", "Play Beta Tracker"],
            ["ecosystem", "Launch Ecosystem"],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-selected={tab === value}
            className={`shrink-0 border-b-2 px-1 py-3 text-xs font-bold uppercase tracking-[0.14em] transition ${tab === value ? "border-amber-500 text-amber-300" : "border-transparent text-zinc-500 hover:text-white"}`}
            key={value}
            onClick={() => setTab(value)}
            role="tab"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "telemetry" ? (
        <div className="space-y-4">
          <div
            className="flex max-w-full gap-2 overflow-x-auto pb-1"
            role="toolbar"
            aria-label="Filter tester reports"
          >
            {(["All", "Pending Review", "Flagged", "Approved"] as const).map(
              (filter) => {
                const count =
                  filter === "All"
                    ? submissions.length
                    : filter === "Pending Review"
                      ? submissions.filter(
                          (submission) =>
                            submission.status === SubmissionStatus.PENDING,
                        ).length
                      : filter === "Approved"
                        ? submissions.filter(
                            (submission) =>
                              submission.status === SubmissionStatus.APPROVED,
                          ).length
                        : submissions.filter(isFlaggedSubmission).length;
                return (
                  <button
                    aria-pressed={reportFilter === filter}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${reportFilter === filter ? "border-amber-400/40 bg-amber-500/10 text-amber-200" : "border-white/10 text-zinc-500 hover:text-white"}`}
                    key={filter}
                    onClick={() => setReportFilter(filter)}
                    type="button"
                  >
                    {filter}
                    <span className="ml-2 font-mono opacity-70">{count}</span>
                  </button>
                );
              },
            )}
          </div>
          {selected ? (
            <TelemetryHub
              submissions={filteredSubmissions}
              selected={selected}
              selectedId={visibleSelectedId}
              setSelectedId={setSelectedId}
              feedback={feedback}
              severity={severity}
              telemetry={telemetry}
              logOpen={logOpen}
              setLogOpen={setLogOpen}
              copyIssue={copyIssue}
              copyDiagnosticPayload={copyDiagnosticPayload}
              exportTelemetry={exportTelemetry}
              notice={notice}
            />
          ) : (
            <AuditEmptyState filter={reportFilter} />
          )}
        </div>
      ) : null}
      {tab === "compliance" ? <PlayTracker /> : null}
      {tab === "ecosystem" ? (
        <Ecosystem
          filter={resourceFilter}
          setFilter={setResourceFilter}
          items={filteredResources}
        />
      ) : null}
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
  copyDiagnosticPayload: () => void;
  exportTelemetry: () => void;
  notice: string;
};

function AuditEmptyState({ filter }: { filter: ReportFilter }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="luxury-panel rounded-2xl p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-amber-500">
          Developer telemetry &amp; audit hub
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">
          Completed tester reports
        </h2>
        <p className="mt-5 rounded-xl border border-dashed border-white/15 bg-zinc-950/40 p-5 text-sm leading-6 text-zinc-400">
          {filter === "All"
            ? "No tester reports yet. Reports will appear here after a tester submits proof."
            : `No reports match the ${filter} filter.`}
        </p>
      </section>
      <section
        className="luxury-panel rounded-2xl p-5"
        aria-label="Diagnostic report schema preview"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-amber-500">
              Inspection schema
            </p>
            <h2 className="mt-2 text-2xl font-black text-white">
              Diagnostic details
            </h2>
          </div>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-500"
            disabled
            type="button"
          >
            <ClipboardCopy className="size-3.5" /> Copy Diagnostic Payload
            (JSON)
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(
            [
              "OS version",
              "Device model",
              "Screen resolution",
              "Session duration",
              "App build",
              "Network type",
            ] as const
          ).map((label) => (
            <div
              className="rounded-xl border border-white/10 bg-zinc-950/45 p-3"
              key={label}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                {label}
              </p>
              <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-white/[0.08]" />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950/45 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            Feedback and diagnostic logs
          </p>
          <div className="mt-3 h-2 w-full animate-pulse rounded bg-white/[0.07]" />
          <div className="mt-2 h-2 w-4/5 animate-pulse rounded bg-white/[0.07]" />
          <div className="mt-2 h-2 w-3/5 animate-pulse rounded bg-white/[0.07]" />
        </div>
      </section>
    </div>
  );
}
function TelemetryHub({
  submissions,
  selected,
  selectedId,
  setSelectedId,
  feedback,
  severity,
  telemetry,
  logOpen,
  setLogOpen,
  copyIssue,
  copyDiagnosticPayload,
  exportTelemetry,
  notice,
}: TelemetryProps) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
      <div className="luxury-panel rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-amber-500">
              Developer telemetry &amp; audit hub
            </p>
            <h2 className="mt-2 text-2xl font-black">Tester reports</h2>
          </div>
          <FileJson className="size-5 text-amber-500" />
        </div>
        <div className="mt-5 space-y-2">
          {submissions.length ? (
            submissions.map((submission) => (
              <button
                aria-pressed={selectedId === submission.id}
                className={`w-full rounded-xl border p-3 text-left transition ${selectedId === submission.id ? "border-amber-400/40 bg-amber-500/10" : "border-white/10 bg-zinc-950/45 hover:border-white/20"}`}
                key={submission.id}
                onClick={() => setSelectedId(submission.id)}
                type="button"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold text-white">
                    {submission.campaign.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${submission.status === SubmissionStatus.APPROVED ? "border-emerald-500/25 text-emerald-300" : submission.status === SubmissionStatus.REJECTED ? "border-rose-500/25 text-rose-300" : "border-amber-500/25 text-amber-200"}`}
                    >
                      {submission.status.toLowerCase().replaceAll("_", " ")}
                    </span>
                    <span className="font-mono text-xs text-zinc-300">
                      ${(submission.payoutCents / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {submission.tester.username} · {submission.id.slice(-8)}
                </p>
              </button>
            ))
          ) : (
            <p className="rounded-xl border border-white/10 p-5 text-sm text-zinc-500">
              No reports match the selected filter.
            </p>
          )}
        </div>
      </div>
      <div className="luxury-panel rounded-2xl p-5">
        {selected ? (
          <div>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-amber-500">
                  {selected.campaign.title}
                </p>
                <h2 className="mt-2 text-2xl font-black">Validation report</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-bold ${severity.className}`}
                >
                  {severity.label}
                </span>
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/15"
                  onClick={copyDiagnosticPayload}
                  type="button"
                >
                  <ClipboardCopy className="size-3.5" /> Copy Diagnostic JSON
                </button>
              </div>
            </header>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(
                [
                  ["OS version", telemetry.os],
                  ["Device model", telemetry.device],
                  ["Screen resolution", telemetry.resolution],
                  ["Session duration", telemetry.sessionDuration],
                  ["App build", telemetry.build],
                  ["Network type", telemetry.network],
                ] as const
              ).map(([label, value]) => (
                <div
                  className="rounded-xl border border-white/10 bg-zinc-950/55 p-3"
                  key={label}
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    {label}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-zinc-200">
                    {value}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-4">
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-amber-500">
                  Tester feedback
                </p>
                <div className="mt-3 space-y-3 text-sm text-zinc-300">
                  <div>
                    <p className="text-xs font-bold text-zinc-500">
                      Steps to reproduce
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      {feedback
                        .split(/[\n.;]+/)
                        .filter(Boolean)
                        .slice(0, 4)
                        .map((step, index) => (
                          <li key={`${step}-${index}`}>{step.trim()}</li>
                        ))}
                    </ol>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-500">
                      Expected behavior
                    </p>
                    <p className="mt-1">{parseField(feedback, "Expected")}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-zinc-500">
                      Actual behavior
                    </p>
                    <p className="mt-1">{parseField(feedback, "Actual")}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
                  <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 font-mono text-[10px] text-zinc-400">
                    Proof media
                  </span>
                  {selected.recordingUrl ? (
                    <video
                      className="max-h-72 w-full"
                      controls
                      src={selected.recordingUrl}
                    />
                  ) : selected.proofImageUrl ? (
                    <Image
                      alt="Tester proof"
                      className="max-h-72 w-full object-contain"
                      height={288}
                      src={selected.proofImageUrl}
                      width={480}
                    />
                  ) : (
                    <p className="text-sm text-zinc-600">
                      No recording attached
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-zinc-950 p-4">
                  <button
                    aria-expanded={logOpen}
                    className="flex w-full items-center justify-between text-left font-mono text-xs text-zinc-300"
                    onClick={() => setLogOpen(!logOpen)}
                    type="button"
                  >
                    <span>&gt; crash_network.log</span>
                    <span>{logOpen ? "Hide" : "Show"}</span>
                  </button>
                  {logOpen ? (
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-5 text-emerald-300/80">
                      {selected.crashLogs || "No crash logs attached."}
                      {selected.networkLogs
                        ? `\n\n--- network.log ---\n${selected.networkLogs}`
                        : ""}
                    </pre>
                  ) : null}
                  <button
                    className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-amber-400"
                    onClick={() => copyIssue("logs")}
                    type="button"
                  >
                    <Clipboard className="size-3.5" /> Copy Full Log
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-amber-400/40 hover:text-white"
                onClick={() => copyIssue("GitHub")}
                type="button"
              >
                <Code2 className="size-3.5" /> Copy GitHub Issue
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-amber-400/40 hover:text-white"
                onClick={() => copyIssue("Linear")}
                type="button"
              >
                <Send className="size-3.5" /> Copy for Linear
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
                onClick={exportTelemetry}
                type="button"
              >
                <Download className="size-3.5" /> Download Raw JSON
              </button>
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-white/10 p-8 text-sm text-zinc-500">
            Select a report to inspect its audit details.
          </p>
        )}
        {notice ? (
          <p
            className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs text-emerald-200"
            role="status"
          >
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const playBetaSteps = [
  {
    id: "track",
    title: "Create a closed testing track",
    detail: "Set up the appropriate track in Google Play Console.",
  },
  {
    id: "build",
    title: "Upload and publish the test build",
    detail:
      "Check versioning, release notes, and installability before rollout.",
  },
  {
    id: "testers",
    title: "Add your tester group",
    detail: "Invite opted-in testers through an email list or Google Group.",
  },
  {
    id: "opt-in",
    title: "Share the opt-in link",
    detail: "Confirm testers can join the test and install the app.",
  },
  {
    id: "monitor",
    title: "Monitor feedback and crashes",
    detail: "Review tester reports throughout the test window.",
  },
  {
    id: "requirements",
    title: "Verify current Play requirements",
    detail:
      "Thresholds vary by account and can change; confirm the current requirement in Play Console.",
  },
] as const;

const playBetaStorageKey = "seedenv-play-beta-readiness-v1";
const playBetaStorageEvent = "seedenv-play-beta-checklist-change";

function subscribePlayBetaChecklist(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(playBetaStorageEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(playBetaStorageEvent, onChange);
  };
}

function getPlayBetaSnapshot() {
  try {
    return window.localStorage.getItem(playBetaStorageKey) || "{}";
  } catch {
    return "{}";
  }
}

function parsePlayBetaSnapshot(snapshot: string) {
  try {
    const parsed = JSON.parse(snapshot) as Record<string, unknown>;
    return Object.fromEntries(
      playBetaSteps.map((item) => [item.id, parsed[item.id] === true]),
    );
  } catch {
    return {};
  }
}

function PlayTracker() {
  const snapshot = useSyncExternalStore(
    subscribePlayBetaChecklist,
    getPlayBetaSnapshot,
    () => "{}",
  );
  const completed = useMemo(() => parsePlayBetaSnapshot(snapshot), [snapshot]);
  const [notice, setNotice] = useState("");
  const completedCount = playBetaSteps.filter(
    (item) => completed[item.id],
  ).length;

  function toggleStep(stepId: string) {
    const next = { ...completed, [stepId]: !completed[stepId] };
    try {
      localStorage.setItem(playBetaStorageKey, JSON.stringify(next));
      window.dispatchEvent(new Event(playBetaStorageEvent));
      setNotice("Checklist progress saved in this browser.");
    } catch {
      setNotice("Could not save checklist progress in this browser.");
    }
  }

  function exportChecklist() {
    const report = {
      generatedAt: new Date().toISOString(),
      completedCount,
      totalSteps: playBetaSteps.length,
      note: "Manual readiness checklist. This is not a live Google Play opt-in tester report.",
      steps: playBetaSteps.map((item) => ({
        id: item.id,
        title: item.title,
        completed: Boolean(completed[item.id]),
      })),
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "seedenv-play-beta-readiness.json";
    link.click();
    URL.revokeObjectURL(url);
    setNotice("Readiness checklist exported as JSON.");
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-amber-500">
            Google Play beta preparation
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">
            Readiness checklist
          </h2>
          <p className="mt-1 text-sm text-neutral-400">
            Track setup tasks before inviting a tester cohort.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-white/20 hover:text-white"
            href="https://play.google.com/console"
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="size-3.5" /> Open Play Console
          </a>
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-neutral-950 transition hover:bg-amber-400"
            onClick={exportChecklist}
            type="button"
          >
            <Download className="size-3.5" /> Export checklist
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Readiness items
          </p>
          <p className="mt-2 font-mono text-xl font-bold text-white">
            {completedCount} / {playBetaSteps.length}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Progress
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-amber-500 transition-[width]"
              style={{
                width: `${(completedCount / playBetaSteps.length) * 100}%`,
              }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-950/55 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Progress storage
          </p>
          <p className="mt-2 text-sm font-semibold text-white">
            Saved in this browser
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950/45">
        {playBetaSteps.map((item) => (
          <label
            className="flex cursor-pointer items-start gap-3 border-b border-white/[0.06] p-4 last:border-b-0 hover:bg-white/[0.02]"
            key={item.id}
          >
            <input
              checked={Boolean(completed[item.id])}
              className="mt-1 size-4 accent-amber-500"
              onChange={() => toggleStep(item.id)}
              type="checkbox"
            />
            <span>
              <span
                className={`block text-sm font-semibold ${completed[item.id] ? "text-emerald-300" : "text-white"}`}
              >
                {item.title}
              </span>
              <span className="mt-1 block text-xs leading-5 text-zinc-500">
                {item.detail}
              </span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-xs leading-5 text-zinc-500">
        SeedEnv does not receive live Play Console opt-in data. Verify tester
        counts and compliance status directly in Play Console.
      </p>
      {notice ? (
        <p
          className="rounded-lg border border-white/10 bg-zinc-950/50 p-3 text-xs text-zinc-300"
          role="status"
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}
function Ecosystem({
  filter,
  setFilter,
  items,
}: {
  filter: ResourceCategory;
  setFilter: (filter: ResourceCategory) => void;
  items: Resource[];
}) {
  return (
    <section className="luxury-panel rounded-2xl p-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-amber-500">
            Launch &amp; growth resource hub
          </p>
          <h2 className="mt-2 text-2xl font-black">Launch Ecosystem</h2>
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="toolbar"
          aria-label="Filter launch resources"
        >
          {(
            [
              "All",
              "User Acquisition",
              "UGC & Content",
              "Analytics & SDKs",
              "ASO",
            ] as const
          ).map((value) => (
            <button
              aria-pressed={filter === value}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${filter === value ? "border-amber-400/40 bg-amber-500/10 text-amber-200" : "border-white/10 text-zinc-500 hover:text-white"}`}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              <Filter className="mr-1 inline size-3" />
              {value}
            </button>
          ))}
        </div>
      </header>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((resource) => {
          const Icon = resource.icon;
          const external = resource.href.startsWith("https://");
          return (
            <article
              className="rounded-xl border border-white/10 bg-zinc-950/55 p-4 transition hover:-translate-y-0.5 hover:border-amber-400/30"
              key={resource.name}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-500/10 text-amber-300">
                  <Icon className="size-4" />
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-200">
                  {resource.perk}
                </span>
              </div>
              <h3 className="mt-4 font-bold text-white">{resource.name}</h3>
              <p className="mt-2 text-sm leading-5 text-zinc-400">
                {resource.description}
              </p>
              <a
                className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-amber-400 hover:text-amber-300"
                href={resource.href}
                rel={external ? "noreferrer" : undefined}
                target={external ? "_blank" : undefined}
              >
                {external ? "Open resource" : "Open in console"}{" "}
                <ExternalLink className="size-3.5" />
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
