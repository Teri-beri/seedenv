import { BackButton } from "@/components/back-button";

export function MemberShell({ title, subtitle, children, home, back, backLabel, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; home: string; back?: string; backLabel?: string; wide?: boolean }) {
  return <main id="main-content" className="mobile-app-shell min-h-screen bg-background px-4 py-6 text-white sm:px-6"><div className={`mx-auto ${wide ? "max-w-7xl" : "max-w-5xl"}`}><header className="mb-6"><BackButton fallbackHref={back ?? home} label={backLabel} className="-ml-1 mb-2" /><p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">SeedEnv</p><h1 className="mt-2 text-2xl font-bold">{title}</h1>{subtitle ? <p className="mt-1 font-mono text-xs text-zinc-400">{subtitle}</p> : null}</header>{children}</div></main>;
}
