"use client";

import { signIn } from "next-auth/react";
import { MailCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await signIn("email", {
        email,
        redirect: false,
        callbackUrl: "/dashboard",
      });
      if (result?.error) {
        setMessage("We could not send that login link. Check your email address and Resend configuration.");
        return;
      }
      setMessage("Check your inbox for the SeedEnv authentication link.");
    });
  }

  return (
    <form className="mt-6 space-y-4" onSubmit={submit}>
      <label className="block space-y-2 text-sm font-semibold text-neutral-300">
        Email address
        <input
          autoComplete="email"
          className="w-full rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-violet-500/50"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          required
          type="email"
          value={email}
        />
      </label>
      <Button className="w-full" disabled={isPending || !email} type="submit">
        <MailCheck className="size-4" /> Send authentication link
      </Button>
      {message && <p className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-3 text-sm text-neutral-300">{message}</p>}
    </form>
  );
}
