"use client";

import { Globe2 } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export function ReferrerFavicon({ src, host }: { src: string; host: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative grid size-4 shrink-0 place-items-center overflow-hidden rounded-sm" title={host}>
      <Globe2 className="size-3.5 text-zinc-500" />
      {!failed ? <Image alt="" className="object-cover" fill onError={() => setFailed(true)} sizes="16px" src={src} unoptimized /> : null}
    </span>
  );
}