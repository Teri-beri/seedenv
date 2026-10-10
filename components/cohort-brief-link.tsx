"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function CohortBriefLink({ campaignId, children, className }: { campaignId: string; children: ReactNode; className?: string }) {
  function track() {
    void fetch("/api/cohorts/click", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId }), keepalive: true })
      .then(async response => {
        if (!response.ok) console.warn("SeedEnv cohort click could not be recorded:", response.status);
      })
      .catch(error => console.warn("SeedEnv cohort click tracking unavailable:", error));
  }
  return <Link href={`/cohorts/${encodeURIComponent(campaignId)}`} className={className} onClick={track} onAuxClick={event => { if (event.button === 1) track(); }}>{children}</Link>;
}
