import { BackButton } from "@/components/back-button";

export function MemberShell({ title, children, home, back }: { title: string; children: React.ReactNode; home: string; back?: string }) {
  return <main className="mobile-app-shell min-h-screen bg-background px-4 py-6 text-white sm:px-6"><div className="mx-auto max-w-5xl"><header className="mb-6"><BackButton fallbackHref={back ?? home} className="-ml-1 mb-2" /><p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-400">SeedEnv</p><h1 className="mt-2 text-2xl font-bold">{title}</h1></header>{children}</div></main>;
}
