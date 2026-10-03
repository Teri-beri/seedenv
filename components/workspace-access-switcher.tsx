"use client";

import { UserRole } from "@prisma/client";
import { BriefcaseBusiness, Check, LoaderCircle, Sprout } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { activateAccountWorkspace, type WorkspaceRole } from "@/app/actions/accountActions";

export function WorkspaceAccessSwitcher({
  activeRole,
  testerEnabled,
  developerEnabled,
}: {
  activeRole: UserRole;
  testerEnabled: boolean;
  developerEnabled: boolean;
}) {
  const router = useRouter();
  const { update } = useSession();
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function activate(role: WorkspaceRole) {
    if (role === activeRole || isPending) return;
    setMessage("");
    startTransition(async () => {
      const result = await activateAccountWorkspace(role);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      await update();
      const destination = role === UserRole.DEVELOPER ? "/console" : "/dashboard";
      router.replace(destination);
      router.refresh();
    });
  }

  const workspaces: Array<{ role: WorkspaceRole; label: string; enabled: boolean; icon: typeof Sprout }> = [
    { role: UserRole.TESTER, label: "Tester", enabled: testerEnabled, icon: Sprout },
    { role: UserRole.DEVELOPER, label: "Developer", enabled: developerEnabled, icon: BriefcaseBusiness },
  ];

  return (
    <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md" aria-labelledby="workspace-access-title">
      <p className="text-xs uppercase tracking-[0.22em] text-amber-500">Workspace access</p>
      <h2 className="mt-2 text-xl font-bold text-white" id="workspace-access-title">One login, two workspaces</h2>
      <p className="mt-2 text-sm leading-6 text-neutral-400">Use the same verified email for one Tester workspace and one Developer workspace. Each can be activated once.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {workspaces.map(({ role, label, enabled, icon: Icon }) => {
          const active = role === activeRole;
          return (
            <button
              aria-pressed={active}
              aria-label={active ? `${label} workspace is active` : enabled ? `Switch to ${label} workspace` : `Create ${label.toLowerCase()} workspace`}
              className={`flex min-h-[76px] min-w-0 w-full flex-col items-start justify-center gap-2 rounded-lg border px-4 py-3 text-left text-sm font-semibold transition ${active ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-[#2A2F3D] bg-[#090A0F]/55 text-neutral-300 hover:border-amber-500/30 hover:text-white"}`}
              disabled={isPending || active}
              key={role}
              onClick={() => activate(role)}
              type="button"
            >
              <span className="flex min-w-0 items-start gap-2"><Icon className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 break-words whitespace-normal leading-5">{enabled ? `${label} workspace` : `Create ${label.toLowerCase()} workspace`}</span></span>
              <span className="flex items-center gap-1 pl-6 text-xs font-medium leading-4">{isPending && !active ? <><LoaderCircle className="size-3 animate-spin" /> Switching...</> : active ? <><Check className="size-3" /><span>Current workspace</span></> : <span>{enabled ? `Switch to ${label.toLowerCase()}` : "Add workspace"}</span>}</span>
            </button>
          );
        })}
      </div>
      {message ? <p className="mt-3 text-sm text-rose-300" role="alert">{message}</p> : null}
    </section>
  );
}