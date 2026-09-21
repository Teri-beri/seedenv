import { Suspense } from "react";
import { CompactSignupForm } from "@/components/compact-signup-form";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090A0F] px-4 py-12 text-white">
      <Suspense fallback={<SignInFallback />}>
        <CompactSignupForm />
      </Suspense>
    </div>
  );
}

function SignInFallback() {
  return (
    <div className="w-full max-w-md rounded-xl border border-[#1F2430] bg-[#0E1017] p-10 text-center shadow-2xl shadow-black/40">
      <svg className="mx-auto mb-6 size-10 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4Z" />
      </svg>
      <p className="text-sm text-neutral-400">Loading SeedEnv access paths...</p>
    </div>
  );
}
