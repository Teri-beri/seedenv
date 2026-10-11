"use client";

import { Download } from "lucide-react";

export type ArtifactFilter = "all" | "recording" | "screen" | "device" | "crash";

type Option = { value: string; label: string };

const typeOptions: Array<{ value: ArtifactFilter; label: string }> = [
  { value: "all", label: "All evidence" },
  { value: "recording", label: "Screen recordings" },
  { value: "screen", label: "Screenshots" },
  { value: "device", label: "Device logs" },
  { value: "crash", label: "Crash traces" },
];

const selectClass = "min-h-10 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 font-mono text-xs text-zinc-300 outline-none transition-colors focus:border-emerald-500/50";

export function ArtifactsToolbar({
  campaigns,
  validators,
  campaign,
  validator,
  artifactType,
  hasArtifacts,
  onCampaignChange,
  onValidatorChange,
  onTypeChange,
}: {
  campaigns: Option[];
  validators: Option[];
  campaign: string;
  validator: string;
  artifactType: ArtifactFilter;
  hasArtifacts: boolean;
  onCampaignChange: (value: string) => void;
  onValidatorChange: (value: string) => void;
  onTypeChange: (value: ArtifactFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex flex-wrap gap-2">
        <label className="grid gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
          App / Build
          <select className={selectClass} value={campaign} onChange={(event) => onCampaignChange(event.target.value)}>
            <option value="all">All campaigns</option>
            {campaigns.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
          Evidence type
          <select className={selectClass} value={artifactType} onChange={(event) => onTypeChange(event.target.value as ArtifactFilter)}>
            {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[10px] uppercase tracking-wider text-zinc-500">
          Validator
          <select className={selectClass} value={validator} onChange={(event) => onValidatorChange(event.target.value)}>
            <option value="all">All validators</option>
            {validators.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>
      {hasArtifacts ? (
        <a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 font-mono text-xs font-semibold text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white" href="/api/assets/download">
          <Download className="size-4" /> Export Bundle (ZIP + JSON)
        </a>
      ) : (
        <button disabled type="button" className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 font-mono text-xs font-semibold text-zinc-600">
          <Download className="size-4" /> Export Bundle (ZIP + JSON)
        </button>
      )}
    </div>
  );
}
