"use client";

import Image from "next/image";
import { Globe, Smartphone } from "lucide-react";
import { useState } from "react";

export function CohortAppIcon({ iconUrl, platform }: { iconUrl: string | null; platform: string }) {
  const [failed, setFailed] = useState(false);
  let safeUrl = "";
  try {
    const url = new URL(iconUrl || "");
    if (url.protocol === "https:" || url.protocol === "http:") safeUrl = url.toString();
  } catch {
    safeUrl = "";
  }
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 p-1">
      {safeUrl && !failed
        ? <Image src={safeUrl} alt="" width={32} height={32} className="size-full rounded-md object-cover" unoptimized onError={() => setFailed(true)} />
        : platform === "WEB_STAGING" ? <Globe aria-hidden="true" className="size-4 text-zinc-400" /> : <Smartphone aria-hidden="true" className="size-4 text-zinc-400" />}
    </span>
  );
}
