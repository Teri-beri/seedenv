"use client";

import { KeyRound } from "lucide-react";
import { useState, useTransition } from "react";
import { setAccountPassword } from "@/app/actions/accountActions";
import { Button } from "@/components/ui/button";

const inputClass = "w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20";

export function PasswordSettingsForm({ email, hasPassword }: { email: string; hasPassword: boolean }) {
  const [passwordSet, setPasswordSet] = useState(hasPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await setAccountPassword({ password, confirmPassword, currentPassword: passwordSet ? currentPassword : undefined });
      if (!result.ok) return setMessage({ ok: false, text: result.message });
      setPasswordSet(true);
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      setMessage({ ok: true, text: "Password saved." });
    });
  }

  return (
    <form className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md" id="security" onSubmit={submit}>
      <p className="text-xs uppercase tracking-[0.24em] text-amber-500">Security</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-white">{passwordSet ? "Change password" : "Set a password"}</h2>
      <p className="mt-2 text-sm text-neutral-400">{passwordSet ? "Sign in with your email and password, or use an email link." : "Add a password so you can sign in without an email link."}</p>

      <div className="mt-5 grid gap-4">
        <input autoComplete="username" className="hidden" readOnly type="email" value={email} />
        {passwordSet ? (
          <label className="space-y-2 text-sm font-semibold text-neutral-300">
            Current password
            <input autoComplete="current-password" className={inputClass} onChange={(event) => setCurrentPassword(event.target.value)} required type="password" value={currentPassword} />
          </label>
        ) : null}
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          New password
          <input autoComplete="new-password" className={inputClass} minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
        </label>
        <label className="space-y-2 text-sm font-semibold text-neutral-300">
          Confirm new password
          <input autoComplete="new-password" className={inputClass} minLength={10} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
        </label>
        <p className="text-xs text-neutral-500">At least 10 characters, including a letter and a number.</p>
      </div>

      {message ? <p className={`mt-4 rounded-lg p-3 text-sm ${message.ok ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>{message.text}</p> : null}

      <Button className="mt-5 w-full" disabled={isPending} type="submit">
        <KeyRound className="size-4" /> {isPending ? "Saving..." : passwordSet ? "Update Password" : "Set Password"}
      </Button>
    </form>
  );
}
