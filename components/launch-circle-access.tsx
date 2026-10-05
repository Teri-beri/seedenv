"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useTransition } from "react";
import { activateAccountWorkspace, type WorkspaceRole } from "@/app/actions/accountActions";

export function LaunchCircleAccess({ callbackUrl, signedIn, chooseWorkspace = false, activeRole, onChoose }: { callbackUrl: string; signedIn: boolean; chooseWorkspace?: boolean; activeRole?: string; onChoose?: (role: WorkspaceRole) => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const { update } = useSession();
  const router = useRouter();
  const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-[#171923] px-4 py-2 text-sm text-white hover:border-emerald-400/40";
  function choose(role: WorkspaceRole) {
    setMessage("");
    startTransition(async () => {
      try {
        if (role !== activeRole) {
          const result = await activateAccountWorkspace(role);
          if (!result.ok) { setMessage(result.message); return; }
          await update();
        }
        onChoose?.(role);
        router.refresh();
      } catch { setMessage("Workspace could not be selected. Try again."); }
    });
  }
  if (signedIn && chooseWorkspace) return <section className="rounded-lg border border-white/10 p-5"><h2 className="text-lg font-semibold">Choose your Launch Circle workspace</h2><p className="mt-2 text-sm text-zinc-400">Your account has both workspaces. Choose which one you want to post or comment from.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{(["DEVELOPER", "TESTER"] as const).map((role) => <button key={role} type="button" disabled={pending} className={actionClass} onClick={() => choose(role)}>{pending ? "Selecting..." : role === "DEVELOPER" ? "Continue as Developer" : "Continue as Tester"}<ArrowRight className="size-4" /></button>)}</div>{message ? <p role="alert" className="mt-3 text-sm text-amber-300">{message}</p> : null}</section>;
  if (signedIn) return <Link href={callbackUrl} className={actionClass}>Open discussion <ArrowRight className="size-4" /></Link>;
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><button type="button" className={actionClass}>Sign in to comment <ArrowRight className="size-4" /></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/65" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-[#12161F] p-6 text-white"><Dialog.Title className="pr-10 text-xl font-semibold">Join the Launch Circle discussion</Dialog.Title><Dialog.Description className="mt-3 text-sm leading-6 text-zinc-400">Choose your workspace before signing in. You will return directly to this discussion afterward.</Dialog.Description><div className="mt-5 grid gap-3">{(["DEVELOPER", "TESTER"] as const).map((role) => <Link key={role} href={`/auth/signin?role=${role}&callbackUrl=${encodeURIComponent(callbackUrl)}`} className={actionClass}>Continue as {role === "DEVELOPER" ? "Developer" : "Tester"}<ArrowRight className="size-4" /></Link>)}</div><Dialog.Close asChild><button type="button" aria-label="Close Launch Circle sign-in" className="absolute right-3 top-3 grid size-11 place-items-center text-zinc-400"><X className="size-5" /></button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}