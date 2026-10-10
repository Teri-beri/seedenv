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
  return <button type="button" className="min-h-11 text-xs text-zinc-500 hover:text-emerald-300" onClick={() => router.refresh()}>Refresh inbox / auto-updates while visible</button>;
}
