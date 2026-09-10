"use client";

import Image from "next/image";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const result = await signIn("email", {
        email,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (result?.error) {
        console.error("Sign in error:", result.error);
        setMessage("Email delivery failed. Check /api/system/email-health, RESEND_API_KEY, AUTH_EMAIL_FROM, and Resend domain verification.");
      } else {
        setMessage("Success! SeedEnv queued your magic authentication link. Check your inbox and spam folder.");
      }
    } catch (error) {
      console.error("Unexpected sign in error:", error);
      setMessage("An unexpected error occurred. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090A0F] px-4 py-12 text-white">
      <div className="w-full max-w-md rounded-xl border border-[#1F2430] bg-[#0E1017] p-10 shadow-2xl shadow-black/40">
        <div className="mb-10 text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative size-20 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#090A0F] shadow-lg shadow-amber-500/10">
              <Image src="/seedenv-logo.svg" alt="SeedEnv" fill sizes="80px" priority />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-amber-500">Welcome to SeedEnv</h1>
          <p className="mt-3 text-neutral-400">Initialize your session and complete email 2FA</p>
        </div>

        {message && (
          <div className={`mb-8 rounded-lg p-4 text-center ${message.startsWith("Success") ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSignIn} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-300">
              Work or Tester Email
            </label>
            <input
              type="email"
              id="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              className="mt-2 block w-full rounded-lg border border-[#2A2F3D] bg-[#0E1017] px-4 py-3 text-white placeholder-neutral-600 outline-none transition-all focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 font-semibold text-neutral-950 shadow-lg shadow-amber-500/10 transition-all hover:from-amber-400 hover:to-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <svg className="mr-3 size-5 animate-spin text-neutral-950" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
              </svg>
            ) : null}
            {loading ? "Sending link..." : "Authenticate (2FA)"}
          </button>
        </form>
      </div>
    </div>
  );
}
