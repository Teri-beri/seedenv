"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, useTransition } from "react";
import { activateAccountWorkspace, type WorkspaceRole } from "@/app/actions/accountActions";

export function LaunchCircleAccess({ callbackUrl, signedIn, chooseWorkspace = false, activeRole, selectedRole, onChoose }: { callbackUrl: string; signedIn: boolean; chooseWorkspace?: boolean; activeRole?: string; selectedRole?: WorkspaceRole | null; onChoose?: (role: WorkspaceRole) => void }) {
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
  if (signedIn && chooseWorkspace) return <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-zinc-400"><span>Posting as</span><div role="radiogroup" aria-label="Launch Circle identity" className="inline-flex rounded-lg border border-white/10 p-0.5">{(["DEVELOPER", "TESTER"] as const).map((role) => <button key={role} type="button" role="radio" aria-checked={selectedRole === role} disabled={pending} className={`min-h-9 rounded-md px-3 transition-colors ${selectedRole === role ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"}`} onClick={() => { if (selectedRole !== role) choose(role); }}>{role === "DEVELOPER" ? "Developer" : "Tester"}</button>)}</div>{pending ? <span>Switching...</span> : null}{message ? <span role="alert" className="text-amber-300">{message}</span> : null}</div>;
  if (signedIn) return <Link href={callbackUrl} className={actionClass}>Open discussion <ArrowRight className="size-4" /></Link>;
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger asChild><button type="button" className={actionClass}>Sign in to comment <ArrowRight className="size-4" /></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-50 bg-black/65" /><Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-[#12161F] p-6 text-white"><Dialog.Title className="pr-10 text-xl font-semibold">Join the Launch Circle discussion</Dialog.Title><Dialog.Description className="mt-3 text-sm leading-6 text-zinc-400">Choose your workspace before signing in. You will return directly to this discussion afterward.</Dialog.Description><div className="mt-5 grid gap-3">{(["DEVELOPER", "TESTER"] as const).map((role) => <Link key={role} href={`/auth/signin?role=${role}&callbackUrl=${encodeURIComponent(callbackUrl)}`} className={actionClass}>Continue as {role === "DEVELOPER" ? "Developer" : "Tester"}<ArrowRight className="size-4" /></Link>)}</div><Dialog.Close asChild><button type="button" aria-label="Close Launch Circle sign-in" className="absolute right-3 top-3 grid size-11 place-items-center text-zinc-400"><X className="size-5" /></button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}