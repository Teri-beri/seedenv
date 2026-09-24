"use client";

import { LoaderCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { prepareSignupProfile } from "@/app/actions/signupActions";

type SignupRole = "TESTER" | "DEVELOPER";

function getInitialRole(value: string | null): SignupRole {
  return value === "DEVELOPER" ? "DEVELOPER" : "TESTER";
}

function getSafeCallback(value: string | null, role: SignupRole) {
  if (value?.startsWith("/")) return value;
  return role === "DEVELOPER" ? "/console?intent=new-campaign" : "/dashboard";
}

function getOAuthCallback(value: string | null, role: SignupRole) {
  const next = getSafeCallback(value, role);
  const callback = new URL(next, window.location.origin);

  if (callback.pathname === "/onboarding") {
    callback.searchParams.set("role", callback.searchParams.get("role") || role);
    callback.searchParams.set("next", getSafeCallback(callback.searchParams.get("next"), role));
    return `${callback.pathname}${callback.search}`;
  }

  const params = new URLSearchParams({
    role,
    next: `${callback.pathname}${callback.search}${callback.hash}`,
  });
  return `/onboarding?${params.toString()}`;
}

function GitHubMark() {
  return (
    <svg className="size-4" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.96-.82-1.16-.28-.16-.68-.56-.01-.57.63-.01 1.08.59 1.23.84.72 1.24 1.87.89 2.33.68.07-.53.28-.89.51-1.1-1.78-.21-3.64-.91-3.64-4.04 0-.89.31-1.63.82-2.2-.08-.21-.36-1.04.08-2.17 0 0 .67-.22 2.2.84A7.43 7.43 0 0 1 8 3.89c.68 0 1.36.09 2 .28 1.53-1.06 2.2-.84 2.2-.84.44 1.13.16 1.96.08 2.17.51.57.82 1.3.82 2.2 0 3.14-1.87 3.83-3.65 4.04.29.26.54.75.54 1.52 0 1.1-.01 1.98-.01 2.25 0 .22.15.48.55.4A8.12 8.12 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z" />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.96 10.7A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.16.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.82.95 4.03l3.01-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58C13.46.89 11.42 0 9 0A9 9 0 0 0 .95 4.97L3.96 7.3C4.67 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

export function CompactSignupForm() {
  const searchParams = useSearchParams();
  const [role, setRole] = useState<SignupRole>(() => getInitialRole(searchParams.get("role")));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function continueWithEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const safeName = name.trim();
      const usernameBase = safeName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 22) || "member";
      const profile = await prepareSignupProfile({
        role,
        email,
        name: safeName,
        username: `${role === "TESTER" ? "scout" : "studio"}_${usernameBase}_${Date.now().toString(36).slice(-4)}`,
        bio: role === "TESTER" ? "SeedEnv Scout validator" : "SeedEnv developer launching a validation cohort",
        portfolioUrl: "",
        companyName: role === "DEVELOPER" ? `${safeName} Studio` : "",
        productUrl: "",
      });
      const next = getSafeCallback(searchParams.get("callbackUrl"), role);
      const result = await signIn("email", {
        email: profile.email,
        redirect: false,
        callbackUrl: `/onboarding?${profile.onboardingParams}&next=${encodeURIComponent(next)}`,
      });

      setMessage(result?.error
        ? "We could not send that access link. Please check your email and try again."
        : "Access link sent. Check your inbox and spam folder to continue.");
    } catch (error) {
      console.error("SeedEnv signup failed:", error);
      setMessage(error instanceof Error ? error.message : "We could not start your SeedEnv account.");
    } finally {
      setLoading(false);
    }
  }

  async function continueWithProvider(provider: "github" | "google") {
    setLoading(true);
    setMessage("");

    try {
      const result = await signIn(provider, {
        callbackUrl: getOAuthCallback(searchParams.get("callbackUrl"), role),
        redirect: false,
      });
      if (result?.error) {
        setMessage(`${provider === "github" ? "GitHub" : "Google"} access could not start. Continue with email instead.`);
        setLoading(false);
        return;
      }
      if (result?.url) window.location.href = result.url;
    } catch (error) {
      console.error("SeedEnv OAuth sign-in failed:", error);
      setMessage(`${provider === "github" ? "GitHub" : "Google"} access is not enabled on this deployment yet. Continue with email instead.`);
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-lg space-y-7 rounded-2xl border border-white/[0.08] bg-zinc-950/75 p-6 shadow-2xl shadow-black/80 backdrop-blur-xl sm:p-8">
      <div className="grid grid-cols-2 rounded-xl border border-zinc-800 bg-zinc-900 p-1" role="tablist" aria-label="Account type">
        {(["TESTER", "DEVELOPER"] as const).map((item) => {
          const active = role === item;
          return (
            <button
              aria-selected={active}
              className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${active ? "border border-white/[0.06] bg-zinc-800 text-white shadow-sm" : "border border-transparent text-zinc-400 hover:text-zinc-200"}`}
              onClick={() => { setRole(item); setMessage(""); }}
              role="tab"
              type="button"
              key={item}
            >
              {item === "TESTER" ? "Tester Access" : "Developer Access"}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Create {role === "TESTER" ? "tester" : "developer"} account</h1>
        <p className="text-base leading-6 text-zinc-400">{role === "TESTER" ? "Start with Tier 1 Scout missions and build your rank." : "Launch validation cohorts with transparent payouts and proof."}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button aria-label="Continue with GitHub" className="flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-800/50 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} onClick={() => continueWithProvider("github")} type="button"><GitHubMark /> {loading ? "Opening..." : "GitHub"}</button>
        <button aria-label="Continue with Google" className="flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-800/50 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} onClick={() => continueWithProvider("google")} type="button"><GoogleMark /> Google</button>
      </div>

      <div className="relative flex items-center justify-center"><div className="w-full border-t border-zinc-800" /><span className="absolute bg-[#0b0c10] px-3 text-xs font-mono uppercase tracking-wider text-zinc-500">or continue with email</span></div>

      <form className="space-y-5" onSubmit={continueWithEmail}>
        <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400" htmlFor="signup-name">Full Name<input autoComplete="name" className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-base text-white outline-none transition-all placeholder:text-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20" id="signup-name" onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" required value={name} /></label>
        <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400" htmlFor="signup-email">Email Address<input autoComplete="email" className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-base text-white outline-none transition-all placeholder:text-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20" id="signup-email" onChange={(event) => setEmail(event.target.value)} placeholder="alex@company.com" required type="email" value={email} /></label>
        <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300/20 bg-gradient-to-b from-amber-400 to-amber-600 px-4 py-3.5 text-base font-semibold text-black shadow-lg shadow-amber-500/15 transition-all hover:from-amber-300 hover:to-amber-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} type="submit">{loading ? <LoaderCircle className="size-4 animate-spin" /> : null}{loading ? "Sending access link..." : "Continue to Onboarding"}</button>
      </form>

      {message ? <p className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 text-center text-xs leading-5 text-zinc-300" role="status">{message}</p> : null}
      <p className="pt-1 text-center text-sm text-zinc-500">Already have an account? <a className="font-semibold text-amber-400 hover:underline" href="/auth/signin">Sign in</a></p>
    </div>
  );
}
