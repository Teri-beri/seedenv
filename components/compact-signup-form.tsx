"use client";

import { Code2, Globe2, LoaderCircle } from "lucide-react";
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
    <div className="w-full max-w-lg space-y-8 rounded-2xl border border-white/10 bg-neutral-900/60 p-6 shadow-2xl shadow-black/30 backdrop-blur-md sm:p-8">
      <div className="grid grid-cols-2 rounded-xl border border-neutral-800 bg-zinc-950/70 p-1" role="tablist" aria-label="Account type">
        {(["TESTER", "DEVELOPER"] as const).map((item) => {
          const active = role === item;
          return (
            <button
              aria-selected={active}
              className={`rounded-lg px-3 py-3 text-sm transition-all ${active ? "border border-amber-500/40 bg-amber-500/10 font-semibold text-amber-400" : "font-medium text-zinc-400 hover:text-white"}`}
              onClick={() => { setRole(item); setMessage(""); }}
              role="tab"
              type="button"
              key={item}
            >
              {item === "TESTER" ? "🧪 Tester Access" : "💻 Developer Access"}
            </button>
          );
        })}
      </div>

      <div className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-amber-400">{role === "TESTER" ? "Tester access" : "Developer access"}</p>
        <h1 className="text-3xl font-bold tracking-tight text-white">Create {role === "TESTER" ? "tester" : "developer"} account</h1>
        <p className="pt-1 text-base leading-6 text-zinc-400">{role === "TESTER" ? "Start with Tier 1 Scout missions and build your rank." : "Launch validation cohorts with transparent payouts and proof."}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button aria-label="Continue with GitHub" className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} onClick={() => continueWithProvider("github")} type="button"><Code2 className="size-4" /> {loading ? "Opening..." : "GitHub"}</button>
        <button aria-label="Continue with Google" className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-zinc-950/60 px-4 py-3 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} onClick={() => continueWithProvider("google")} type="button"><Globe2 className="size-4" /> Google</button>
      </div>

      <div className="relative flex items-center justify-center"><div className="w-full border-t border-zinc-800" /><span className="absolute bg-[#0d0e12] px-3 text-xs font-mono uppercase tracking-wider text-zinc-500">or continue with email</span></div>

      <form className="space-y-5" onSubmit={continueWithEmail}>
        <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400" htmlFor="signup-name">Full Name<input autoComplete="name" className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-4 py-3 text-base text-white outline-none transition-all placeholder:text-neutral-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500" id="signup-name" onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" required value={name} /></label>
        <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400" htmlFor="signup-email">Email Address<input autoComplete="email" className="mt-2 w-full rounded-lg border border-white/10 bg-zinc-950/60 px-4 py-3 text-base text-white outline-none transition-all placeholder:text-neutral-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500" id="signup-email" onChange={(event) => setEmail(event.target.value)} placeholder="alex@company.com" required type="email" value={email} /></label>
        <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3.5 text-base font-semibold text-black shadow-lg shadow-amber-500/10 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} type="submit">{loading ? <LoaderCircle className="size-4 animate-spin" /> : null}{loading ? "Sending access link..." : "Continue to Onboarding →"}</button>
      </form>

      {message ? <p className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3 text-center text-xs leading-5 text-zinc-300" role="status">{message}</p> : null}
      <p className="pt-1 text-center text-sm text-zinc-500">Already have an account? <a className="font-semibold text-amber-400 hover:underline" href="/auth/signin">Sign in</a></p>
    </div>
  );
}
