import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BackButton } from "@/components/back-button";
import { PublicFooter } from "@/components/public-footer";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0F1117] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-h-11 items-center gap-3 text-xl font-bold">
            <Image src="/seedenv-logo-v3.png" alt="" width={36} height={36} className="object-contain" />
            SeedEnv
          </Link>
          <nav aria-label="Primary" className="-mx-2 flex flex-wrap items-center gap-x-1 gap-y-0 text-sm text-neutral-300 sm:gap-x-3">
            <Link href="/explore" className="inline-flex min-h-11 items-center px-2 hover:text-emerald-300">Explore</Link>
            <Link href="/pricing" className="inline-flex min-h-11 items-center px-2 hover:text-emerald-300">Pricing</Link>
            <Link href="/guides" className="inline-flex min-h-11 items-center px-2 hover:text-emerald-300">Guides</Link>
            <Link href="/about" className="inline-flex min-h-11 items-center px-2 hover:text-emerald-300">About</Link>
            <Link href="/auth/signin" className="inline-flex min-h-11 items-center px-2 font-semibold text-emerald-300">Sign In</Link>
          </nav>
        </div>
      </header>
      <main id="main-content" className="mx-auto min-h-[60vh] max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight sm:[&_h1]:text-4xl [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mt-4 [&_p]:max-w-3xl [&_p]:leading-7 [&_p]:text-neutral-300">
        <BackButton fallbackHref="/" className="-ml-1 mb-6" />
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}