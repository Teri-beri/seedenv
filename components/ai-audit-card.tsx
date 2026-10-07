"use client";

import { AlertTriangle, LoaderCircle, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type AiAuditView = {
  status: "PENDING" | "APPROVED" | "NEEDS_CLARIFICATION" | "FLAGGED_FRAUD" | "REJECTED";
  qualityScore: number;
  reproductionValid: boolean;
  missingFields: string[];
  isDuplicate: boolean;
  duplicateRefId: string | null;
  feedbackToTester: string | null;
  fraudRiskScore: number;
  fraudFlags: string[];
  fraudExplanation: string | null;
  mediaChecked: boolean;
  autoClarifiedAt: Date | string | null;
  humanClearedAt: Date | string | null;
};

const labels: Record<AiAuditView["status"], { text: string; className: string }> = {
  APPROVED: { text: "Looks complete", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  NEEDS_CLARIFICATION: { text: "Missing detail", className: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  REJECTED: { text: "Low effort", className: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
  FLAGGED_FRAUD: { text: "Proof flagged", className: "border-rose-500/40 bg-rose-500/15 text-rose-200" },
  PENDING: { text: "AI check pending", className: "border-zinc-700 bg-zinc-900 text-zinc-400" },
};

const flagText = (flag: string) => flag.toLowerCase().replaceAll("_", " ");

export function AiAuditBadge({ audit }: { audit: AiAuditView | null | undefined }) {
  if (!audit) return null;
  const label = audit.status === "FLAGGED_FRAUD" && audit.humanClearedAt ? { text: "Flag cleared", className: labels.APPROVED.className } : labels[audit.status];
  return (
    <span className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${label.className}`}>
      <Sparkles className="size-3" /> {label.text}{audit.status !== "PENDING" ? ` · ${audit.qualityScore}/10` : ""}
    </span>
  );
}

export function AiAuditCard({ submissionId, audit }: { submissionId: string; audit: AiAuditView | null | undefined }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function rerun() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/agent/audit-submission", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) throw new Error(result.message || "Could not re-run the AI check.");
      setMessage(response.status === 202 ? result.message : "AI check updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not re-run the AI check.");
    } finally {
      setBusy(false);
    }
  }

  const flagged = audit?.status === "FLAGGED_FRAUD" && !audit.humanClearedAt;
  return (
    <div className={`rounded-xl border p-4 ${flagged ? "border-rose-500/30 bg-rose-950/20" : "border-zinc-800 bg-[#090A0F]/55"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-neutral-500"><Sparkles className="size-3.5 text-emerald-400" /> AI review assistant</p>
        <button className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-white disabled:opacity-50" disabled={busy} onClick={rerun} type="button">
          {busy ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Re-check
        </button>
      </div>
      {!audit || audit.status === "PENDING" ? (
        <p className="mt-2 text-sm leading-6 text-zinc-400">{audit ? "The AI check hasn't finished yet. It retries automatically; review as usual in the meantime." : "This proof hasn't been checked yet. It is usually checked within a minute of submission."}</p>
      ) : (
        <div className="mt-3 space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${labels[audit.status].className}`}>{labels[audit.status].text}</span>
            <span className="font-mono text-xs text-zinc-300">Quality {audit.qualityScore}/10</span>
            <span className="text-xs text-zinc-500">{audit.reproductionValid ? "Reproducible from the steps given" : "Not reproducible as written"}</span>
          </div>
          {audit.missingFields.length ? <div><p className="text-xs text-zinc-500">Missing</p><ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-zinc-300">{audit.missingFields.map((field) => <li key={field}>{field}</li>)}</ul></div> : null}
          {audit.isDuplicate ? <p className="text-xs text-amber-300">Likely duplicate of an earlier report{audit.duplicateRefId ? ` (${audit.duplicateRefId.slice(-8)})` : ""}.</p> : null}
          {audit.autoClarifiedAt ? <p className="text-xs text-violet-300">The assistant asked the tester for these details once on your behalf.</p> : null}
          {audit.fraudFlags.length || audit.fraudRiskScore >= 40 ? (
            <div className={`rounded-lg border p-3 ${flagged ? "border-rose-500/30" : "border-zinc-800"}`}>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-200">{flagged ? <ShieldAlert className="size-3.5" /> : <AlertTriangle className="size-3.5" />} Proof risk {audit.fraudRiskScore}/100{audit.fraudFlags.length ? ` · ${audit.fraudFlags.map(flagText).join(", ")}` : ""}</p>
              {audit.fraudExplanation ? <p className="mt-1 text-xs leading-5 text-zinc-400">{audit.fraudExplanation}</p> : null}
              {flagged ? <p className="mt-1 text-xs leading-5 text-zinc-400">Auto-approval is paused until you or SeedEnv review it. You can still approve or reject.</p> : audit.humanClearedAt ? <p className="mt-1 text-xs text-emerald-300">Cleared by SeedEnv review.</p> : null}
            </div>
          ) : audit.mediaChecked ? <p className="text-xs text-zinc-500">Screenshot/recording matches the report.</p> : null}
          <p className="text-[11px] leading-4 text-zinc-600">Advisory only. You make the final decision.</p>
        </div>
      )}
      {message ? <p className="mt-2 text-xs text-zinc-400" role="status">{message}</p> : null}
    </div>
  );
}
