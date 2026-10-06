"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function BackButton({ fallbackHref, label = "Back", className = "" }: { fallbackHref: string; label?: string; className?: string }) {
  const router = useRouter();

  return (
    <Link
      href={fallbackHref}
      onClick={(event) => {
        // Prefer real history when the visitor arrived from another SeedEnv page; otherwise follow the fallback link.
        const cameFromSeedEnv = document.referrer.startsWith(window.location.origin);
        if (cameFromSeedEnv && window.history.length > 1) {
          event.preventDefault();
          router.back();
        }
      }}
      className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${className}`}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
