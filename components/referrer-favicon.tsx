"use client";

import { Globe2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export function ReferrerFavicon({ src, host }: { src: string; host: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative grid size-7 shrink-0 place-items-center overflow-hidden rounded-md border border-white/10 bg-white/[0.04]" title={host}>
      <Globe2 className="size-4 text-neutral-500" />
      {!failed ? <Image alt="" className="object-cover" fill onError={() => setFailed(true)} sizes="28px" src={src} unoptimized /> : null}
    </span>
  );
}