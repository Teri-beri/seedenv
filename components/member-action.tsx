"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function MemberAction({ action, children, disabled = false }: { action: () => Promise<string>; children: React.ReactNode; disabled?: boolean }) {
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return <div><button type="button" disabled={pending || disabled} className="min-h-11 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50" onClick={() => startTransition(async () => {
    setMessage("");
    try { setMessage(await action()); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The action failed. Please try again."); }
  })}>{pending ? "Working..." : children}</button>{message ? <p role="status" className="mt-2 text-sm leading-6 text-neutral-300">{message}</p> : null}</div>;
}
