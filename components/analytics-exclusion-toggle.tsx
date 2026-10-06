"use client";

import { useState } from "react";

export function AnalyticsExclusionToggle({ initialExcluded }: { initialExcluded: boolean }) {
  const [excluded, setExcluded] = useState(initialExcluded);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    try {
      const response = await fetch("/api/analytics/exclusion", { method: excluded ? "DELETE" : "POST" });
      if (response.ok) setExcluded(!excluded);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 flex items-center justify-between gap-3">
      <div>
        <p className={`text-sm ${excluded ? "text-emerald-400" : "text-zinc-100"}`}>{excluded ? "Excluded from analytics" : "Being counted"}</p>
        <p className="mt-1 text-xs text-zinc-500">{excluded ? "Visits from this browser are ignored, even when signed out." : "Signed-out visits from this browser still count."}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={excluded}
        aria-label="Exclude this browser from analytics"
        disabled={pending}
        onClick={toggle}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${excluded ? "border-emerald-500/40 bg-emerald-500/30" : "border-zinc-700 bg-zinc-800"}`}
      >
        <span className={`absolute top-0.5 size-3.5 rounded-full transition-all ${excluded ? "left-[18px] bg-emerald-400" : "left-0.5 bg-zinc-400"}`} />
      </button>
    </div>
  );
}
