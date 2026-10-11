"use client";

import { X } from "lucide-react";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "hide_promo_banner";
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function isDismissed() {
  // Storage is unavailable in locked-down browsers; show the banner rather than hiding it.
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function ConsolePromoBanner({ children }: { children: React.ReactNode }) {
  // The server cannot read the dismissal flag, so it renders nothing until the client fills it in.
  const dismissed = useSyncExternalStore(subscribe, isDismissed, () => true);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // A dismissal that cannot be persisted is not worth failing the click over.
    }
    for (const listener of listeners) listener();
  }

  if (dismissed) return null;
  return (
    <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-300">
      <p>{children}</p>
      <button type="button" onClick={dismiss} aria-label="Dismiss platform fee notice" className="-m-1 shrink-0 rounded-md p-1 text-emerald-400/70 transition-colors hover:bg-emerald-500/10 hover:text-emerald-200">
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
