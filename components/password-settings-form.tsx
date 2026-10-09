"use client";

import { KeyRound, MailCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { requestPasswordChangeVerification, revokeAllAccountSessions } from "@/app/actions/accountActions";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function PasswordSettingsForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function requestVerification() {
    setMessage(null);
    startTransition(async () => {
      const result = await requestPasswordChangeVerification();
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      setMessage({ ok: true, text: `Verification link sent to ${email}. It expires in 15 minutes.` });
    });
  }

  function signOutEverywhere() {
    setMessage(null);
    startTransition(async () => {
      const result = await revokeAllAccountSessions();
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      await signOut({ callbackUrl: "/auth/signin" });
    });
  }

  return (
    <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md" id="security">
      <p className="text-xs uppercase tracking-[0.24em] text-amber-500">Security</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-white">{hasPassword ? "Change password" : "Set a password"}</h2>
      <p className="mt-2 text-sm text-neutral-400">We’ll send a one-time verification link to confirm it’s you before you choose a new password.</p>

      {message ? <p className={`mt-4 rounded-lg p-3 text-sm ${message.ok ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>{message.text}</p> : null}

      <Button className="mt-5 w-full" disabled={isPending} onClick={requestVerification} type="button">
        {hasPassword ? <KeyRound className="size-4" /> : <MailCheck className="size-4" />}
        {isPending ? "Sending..." : hasPassword ? "Email Password Change Link" : "Email Setup Link"}
      </Button>
      <p className="mt-4 text-sm text-neutral-400">Changing your password signs out every session. If you suspect unauthorized access, sign out all devices now.</p>
      <Button className="mt-3 w-full" disabled={isPending} onClick={signOutEverywhere} type="button">
        Sign out all devices
      </Button>
    </section>
  );
}
