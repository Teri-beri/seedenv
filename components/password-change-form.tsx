"use client";

import { KeyRound, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changePasswordAfterEmailVerification } from "@/app/actions/accountActions";

const inputClass = "mt-2 w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20";

export function PasswordChangeForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const result = await changePasswordAfterEmailVerification({ token, password, confirmPassword });
      if (!result.ok) return setMessage(result.message);
      setComplete(true);
      setPassword("");
      setConfirmPassword("");
      router.refresh();
    });
  }

  if (complete) {
    return (
      <>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">Verified</p>
        <h1 className="mt-3 text-2xl font-bold">Password updated</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-400">Your new password is ready to use the next time you sign in.</p>
        <a className="mt-6 inline-flex font-semibold text-amber-400 hover:text-amber-300" href="/account">Return to account</a>
      </>
    );
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-500">Email verified</p>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <p className="text-sm text-neutral-400">At least 10 characters, including a letter and a number.</p>
      <label className="block text-sm font-semibold text-neutral-300">New password
        <input autoComplete="new-password" className={inputClass} maxLength={128} minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
      </label>
      <label className="block text-sm font-semibold text-neutral-300">Confirm new password
        <input autoComplete="new-password" className={inputClass} maxLength={128} minLength={10} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
      </label>
      {message ? <p className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300" role="alert">{message}</p> : null}
      <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3 font-semibold text-neutral-950 transition hover:bg-amber-400 disabled:opacity-60" disabled={isPending} type="submit">
        {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
        {isPending ? "Updating..." : "Update password"}
      </button>
    </form>
  );
}