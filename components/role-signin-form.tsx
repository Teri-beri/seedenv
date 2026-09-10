"use client";

import { BriefcaseBusiness, CheckCircle2, FlaskConical, Sprout } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { prepareSignupProfile } from "@/app/actions/signupActions";

type SignupRole = "TESTER" | "DEVELOPER";

const roleDetails: Record<SignupRole, {
  label: string;
  eyebrow: string;
  headline: string;
  description: string;
  emailLabel: string;
  placeholder: string;
  button: string;
  callback: string;
  icon: React.ReactNode;
  bullets: string[];
}> = {
  TESTER: {
    label: "Tester",
    eyebrow: "Tester access",
    headline: "Plant seeds. Earn cash. Validate launches.",
    description: "Use this path if you want to test early products, submit proof, and build your SeedEnv validator rank.",
    emailLabel: "Tester Email",
    placeholder: "you@gmail.com",
    button: "Join as Tester",
    callback: "/dashboard",
    icon: <Sprout className="size-5" />,
    bullets: ["Browse paid seed missions", "Track cash rewards and XP", "Submit proof after validation"],
  },
  DEVELOPER: {
    label: "Developer",
    eyebrow: "Developer access",
    headline: "Launch deployments with real seeded activity.",
    description: "Use this path if you are funding campaigns, writing validation tasks, and reviewing tester proof.",
    emailLabel: "Work Email",
    placeholder: "founder@company.com",
    button: "Join as Developer",
    callback: "/console?intent=new-drop",
    icon: <BriefcaseBusiness className="size-5" />,
    bullets: ["Create SeedEnv deployments", "Fund escrow-backed rewards", "Review proof and export assets"],
  },
};

function inferInitialRole(callbackUrl: string | null, roleParam: string | null): SignupRole {
  if (roleParam === "DEVELOPER") return "DEVELOPER";
  if (roleParam === "TESTER") return "TESTER";
  return callbackUrl?.startsWith("/console") ? "DEVELOPER" : "TESTER";
}

function getSafeCallback(callbackUrl: string | null, role: SignupRole) {
  if (callbackUrl?.startsWith("/")) return callbackUrl;
  return roleDetails[role].callback;
}

export function RoleSignInForm() {
  const searchParams = useSearchParams();
  const requestedCallback = searchParams.get("callbackUrl");
  const requestedRole = searchParams.get("role");
  const [role, setRole] = useState<SignupRole>(() => inferInitialRole(requestedCallback, requestedRole));
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const selected = roleDetails[role];

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const next = getSafeCallback(requestedCallback, role);
      const profile = await prepareSignupProfile({
        role,
        email,
        name,
        username,
        bio,
        portfolioUrl,
        companyName,
        productUrl,
      });
      const callbackUrl = `/onboarding?${profile.onboardingParams}&next=${encodeURIComponent(next)}`;
      const result = await signIn("email", {
        email: profile.email,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        console.error("Sign in error:", result.error);
        setMessage("Email delivery failed. Check /api/system/email-health, RESEND_API_KEY, AUTH_EMAIL_FROM, and Resend domain verification.");
      } else {
        setMessage(`Success! SeedEnv queued your ${selected.label.toLowerCase()} magic link. Check your inbox and spam folder.`);
      }
    } catch (error) {
      console.error("Unexpected sign in error:", error);
      setMessage("An unexpected error occurred. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid max-h-[calc(100svh-2rem)] w-full max-w-5xl overflow-y-auto rounded-3xl border border-[#1F2430] bg-[#0E1017] shadow-2xl shadow-black/40 sm:max-h-none sm:rounded-2xl lg:grid-cols-[0.92fr_1.08fr]">
      <aside className="border-b border-[#1F2430] bg-[#090A0F]/50 p-5 sm:p-8 lg:border-b-0 lg:border-r">
        <div className="relative mb-5 size-16 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#090A0F] shadow-lg shadow-amber-500/10 sm:mb-8 sm:size-20">
          <Image src="/seedenv-logo.png" alt="SeedEnv" fill sizes="80px" className="scale-125 object-cover" priority />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-500">Welcome to SeedEnv</p>
        <h1 className="mt-3 bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:mt-4 sm:text-4xl">Choose your access path.</h1>
        <p className="mt-4 text-sm leading-6 text-neutral-400">Tester and developer accounts have different dashboards, onboarding, and next actions. Pick the path that matches what you need today.</p>
        <Link className="mt-8 inline-flex text-sm font-semibold text-neutral-500 transition-colors hover:text-neutral-200" href="/">
          Explore public site
        </Link>
      </aside>

      <section className="p-5 sm:p-8">
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(roleDetails) as SignupRole[]).map((item) => {
            const detail = roleDetails[item];
            const active = role === item;
            return (
              <button
                className={`rounded-2xl border p-4 text-left transition-all ${active ? "border-amber-400/40 bg-amber-500/10 shadow-lg shadow-amber-500/10" : "border-[#1F2430] bg-[#090A0F]/45 hover:border-violet-500/30"}`}
                key={item}
                onClick={() => {
                  setRole(item);
                  setMessage("");
                }}
                type="button"
              >
                <span className={`mb-3 inline-flex rounded-xl p-2 ${active ? "bg-amber-500 text-neutral-950" : "bg-violet-950/40 text-violet-200"}`}>{detail.icon}</span>
                <span className="block text-sm font-bold text-white">{detail.label}</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500">{detail.description}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-[#1F2430] bg-[#090A0F]/45 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-500">{selected.eyebrow}</p>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-white">{selected.headline}</h2>
          <ul className="mt-4 grid gap-2 text-sm text-neutral-400">
            {selected.bullets.map((bullet) => (
              <li className="flex items-center gap-2" key={bullet}>
                <CheckCircle2 className="size-4 text-emerald-400" /> {bullet}
              </li>
            ))}
          </ul>
        </div>

        {message && (
          <div className={`mt-6 rounded-lg p-4 text-center ${message.startsWith("Success") ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSignIn} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-neutral-300" htmlFor="name">
              Display Name
              <input
                className="mt-2 block w-full rounded-lg border border-[#2A2F3D] bg-[#0E1017] px-4 py-3 text-white placeholder-neutral-600 outline-none transition-all focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
                id="name"
                onChange={(event) => setName(event.target.value)}
                placeholder={role === "DEVELOPER" ? "Studio lead name" : "Public tester name"}
                required
                value={name}
              />
            </label>
            <label className="block text-sm font-medium text-neutral-300" htmlFor="username">
              Username
              <input
                className="mt-2 block w-full rounded-lg border border-[#2A2F3D] bg-[#0E1017] px-4 py-3 text-white placeholder-neutral-600 outline-none transition-all focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
                id="username"
                onChange={(event) => setUsername(event.target.value)}
                pattern="[A-Za-z0-9_]{3,32}"
                placeholder={role === "DEVELOPER" ? "launch_studio" : "core_validator"}
                required
                value={username}
              />
            </label>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-neutral-300">
              {selected.emailLabel}
            </label>
            <input
              type="email"
              id="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={selected.placeholder}
              className="mt-2 block w-full rounded-lg border border-[#2A2F3D] bg-[#0E1017] px-4 py-3 text-white placeholder-neutral-600 outline-none transition-all focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-neutral-300">
              {role === "DEVELOPER" ? "Launch Goals" : "Tester Profile"}
            </label>
            <textarea
              className="mt-2 block min-h-24 w-full rounded-lg border border-[#2A2F3D] bg-[#0E1017] px-4 py-3 text-white placeholder-neutral-600 outline-none transition-all focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
              id="bio"
              onChange={(event) => setBio(event.target.value)}
              placeholder={role === "DEVELOPER" ? "What kind of product are you launching and what validation do you need?" : "What apps do you like testing, and what feedback are you best at giving?"}
              required
              value={bio}
            />
          </div>

          {role === "DEVELOPER" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-neutral-300" htmlFor="companyName">
                Company / Studio
                <input
                  className="mt-2 block w-full rounded-lg border border-[#2A2F3D] bg-[#0E1017] px-4 py-3 text-white placeholder-neutral-600 outline-none transition-all focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
                  id="companyName"
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Seed Studio"
                  required
                  value={companyName}
                />
              </label>
              <label className="block text-sm font-medium text-neutral-300" htmlFor="productUrl">
                Product URL
                <input
                  className="mt-2 block w-full rounded-lg border border-[#2A2F3D] bg-[#0E1017] px-4 py-3 text-white placeholder-neutral-600 outline-none transition-all focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
                  id="productUrl"
                  onChange={(event) => setProductUrl(event.target.value)}
                  placeholder="https://yourapp.com"
                  type="url"
                  value={productUrl}
                />
              </label>
            </div>
          ) : (
            <label className="block text-sm font-medium text-neutral-300" htmlFor="portfolioUrl">
              Portfolio / Social Proof URL
              <input
                className="mt-2 block w-full rounded-lg border border-[#2A2F3D] bg-[#0E1017] px-4 py-3 text-white placeholder-neutral-600 outline-none transition-all focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20"
                id="portfolioUrl"
                onChange={(event) => setPortfolioUrl(event.target.value)}
                placeholder="https://yourprofile.com"
                type="url"
                value={portfolioUrl}
              />
            </label>
          )}

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
            ) : <FlaskConical className="mr-2 size-4" />}
            {loading ? "Sending link..." : selected.button}
          </button>
        </form>
      </section>
    </div>
  );
}
