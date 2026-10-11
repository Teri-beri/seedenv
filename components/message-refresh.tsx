"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function MessageRefresh() {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const schedule = () => {
      if (timer) clearInterval(timer);
      timer = document.visibilityState === "visible" ? setInterval(() => router.refresh(), 20000) : undefined;
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") router.refresh();
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);
  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[11px] font-mono text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Live Sync Active
    </button>
  );
}
