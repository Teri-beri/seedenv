"use client";

import { ArrowRight, BriefcaseBusiness, CheckCircle2, KeyRound, LoaderCircle, Rocket, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveOnboardingProfile, setAccountPassword } from "@/app/actions/accountActions";

type OnboardingWizardProps = {
  hasPassword: boolean;
  nextPath: string;
  initial: {
    email: string;
    name: string;
    username: string;
    bio: string;
    portfolioUrl: string;
    companyName: string;
    productUrl: string;
    role: string;
  };
};

type Step = "security" | "profile" | "launch";

const inputClass = "mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-base text-white outline-none transition-all placeholder:text-zinc-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20";
const labelClass = "block text-sm font-medium text-zinc-300";
const primaryButtonClass = "flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300/30 bg-amber-500 px-4 py-3.5 text-base font-semibold text-black transition-all hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60";

export function OnboardingWizard({ hasPassword, nextPath, initial }: OnboardingWizardProps) {
  const router = useRouter();
  const isDeveloper = initial.role === "DEVELOPER";
  const steps: Step[] = hasPassword ? ["profile", "launch"] : ["security", "profile", "launch"];
  const [step, setStep] = useState<Step>(steps[0]);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState(initial.name);
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [portfolioUrl, setPortfolioUrl] = useState(initial.portfolioUrl);
  const [companyName, setCompanyName] = useState(initial.companyName);
  const [productUrl, setProductUrl] = useState(initial.productUrl);

  const stepIndex = steps.indexOf(step);
  const stepMeta: Record<Step, { label: string; icon: React.ReactNode }> = {
    security: { label: "Secure account", icon: <KeyRound className="size-4" /> },
    profile: { label: isDeveloper ? "Studio profile" : "Tester profile", icon: isDeveloper ? <BriefcaseBusiness className="size-4" /> : <UserRound className="size-4" /> },
    launch: { label: isDeveloper ? "Launch checklist" : "Get started", icon: <Rocket className="size-4" /> },
  };

  function goNext() {
    setError("");
    setStep(steps[stepIndex + 1]);
  }

  function submitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await setAccountPassword({ password, confirmPassword });
      if (!result.ok) return setError(result.message);
      setPassword("");
      setConfirmPassword("");
      goNext();
    });
  }

  function submitProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const result = await saveOnboardingProfile({ name, username, bio, portfolioUrl, companyName, productUrl });
      if (!result.ok) return setError(result.message);
      goNext();
    });
  }

  const checklist = isDeveloper
    ? [
        { title: "Create your first campaign", detail: "Add your TestFlight, Play Store, or staging link and write validation steps.", href: "/console?intent=new-campaign" },
        { title: "Fund escrow", detail: "Set bounty per task and tester slots. Funds are held until you approve proof.", href: "/console?intent=new-campaign" },
        { title: "Review tester proof", detail: "Approve or reject submissions and export assets from the console.", href: "/console" },
        { title: "Complete your profile", detail: "Update avatar, portfolio, and security settings any time.", href: "/account" },
      ]
    : [
        { title: "Browse seed missions", detail: "Pick an app to validate from the mission board.", href: "/dashboard" },
        { title: "Submit proof", detail: "Follow each step and upload screenshots or feedback.", href: "/dashboard" },
        { title: "Earn XP and rewards", detail: "Approved proof pays into your wallet and raises your rank.", href: "/account" },
      ];

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-6 shadow-2xl shadow-black/80 backdrop-blur-xl sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-500">{isDeveloper ? "Developer onboarding" : "Welcome to SeedEnv"}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Set up your workspace</h1>
      <p className="mt-2 text-sm text-zinc-400">Signed in as <span className="text-zinc-200">{initial.email}</span></p>

      <ol className="mt-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((item, index) => {
          const done = index < stepIndex;
          const active = index === stepIndex;
          return (
            <li className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${active ? "border-amber-400/40 bg-amber-500/10 text-amber-200" : done ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300" : "border-zinc-800 text-zinc-500"}`} key={item}>
              {done ? <CheckCircle2 className="size-4" /> : stepMeta[item].icon}
              <span className="truncate">{stepMeta[item].label}</span>
            </li>
          );
        })}
      </ol>

      {error ? <p className="mt-5 rounded-lg bg-red-950/40 p-3 text-sm text-red-300" role="alert">{error}</p> : null}

      {step === "security" ? (
        <form className="mt-6 space-y-5" onSubmit={submitPassword}>
          <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" />
            <p>Create a password so you can sign in without waiting for an email link. You can still use email links or GitHub/Google any time.</p>
          </div>
          <input autoComplete="username" className="hidden" readOnly type="email" value={initial.email} />
          <label className={labelClass}>New password
            <input autoComplete="new-password" className={inputClass} minLength={10} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <label className={labelClass}>Confirm password
            <input autoComplete="new-password" className={inputClass} minLength={10} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" value={confirmPassword} />
          </label>
          <p className="text-xs text-zinc-500">At least 10 characters, including a letter and a number.</p>
          <button className={primaryButtonClass} disabled={isPending} type="submit">
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : null} Save password &amp; continue
          </button>
        </form>
      ) : null}

      {step === "profile" ? (
        <form className="mt-6 space-y-5" onSubmit={submitProfile}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>Display name
              <input autoComplete="name" className={inputClass} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" required value={name} />
            </label>
            <label className={labelClass}>Username
              <input className={inputClass} onChange={(event) => setUsername(event.target.value)} pattern="[A-Za-z0-9_]{3,32}" placeholder={isDeveloper ? "launch_studio" : "core_validator"} required title="3-32 letters, numbers, or underscores" value={username} />
            </label>
          </div>
          {isDeveloper ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Company / Studio
                <input autoComplete="organization" className={inputClass} maxLength={100} onChange={(event) => setCompanyName(event.target.value)} placeholder="Seed Studio" required value={companyName} />
              </label>
              <label className={labelClass}>Product URL
                <input className={inputClass} onChange={(event) => setProductUrl(event.target.value)} placeholder="https://yourapp.com" type="url" value={productUrl} />
              </label>
            </div>
          ) : null}
          <label className={labelClass}>Portfolio / website
            <input className={inputClass} onChange={(event) => setPortfolioUrl(event.target.value)} placeholder="https://yourprofile.com" type="url" value={portfolioUrl} />
          </label>
          <label className={labelClass}>{isDeveloper ? "What are you launching?" : "About you"}
            <textarea className={`${inputClass} min-h-24`} maxLength={240} onChange={(event) => setBio(event.target.value)} placeholder={isDeveloper ? "Describe your product and the validation you need." : "What apps do you like testing?"} value={bio} />
          </label>
          <button className={primaryButtonClass} disabled={isPending} type="submit">
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : null} Save profile &amp; continue
          </button>
        </form>
      ) : null}

      {step === "launch" ? (
        <div className="mt-6 space-y-5">
          <ul className="space-y-3">
            {checklist.map((item, index) => (
              <li key={item.title}>
                <Link className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-amber-400/30" href={item.href}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-sm font-bold text-amber-300">{index + 1}</span>
                  <span>
                    <span className="block text-sm font-semibold text-white">{item.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-400">{item.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <button className={primaryButtonClass} onClick={() => { router.push(nextPath); router.refresh(); }} type="button">
            {isDeveloper ? "Open developer console" : "Go to dashboard"} <ArrowRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
