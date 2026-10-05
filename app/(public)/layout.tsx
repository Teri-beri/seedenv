import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { PublicFooter } from "@/components/public-footer";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0F1117] text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3 text-xl font-bold">
            <Image src="/icon-192.png" alt="" width={36} height={36} className="rounded-lg" />
            SeedEnv
          </Link>
          <nav aria-label="Primary" className="flex flex-wrap items-center gap-5 text-sm text-neutral-300">
            <Link href="/explore" className="hover:text-emerald-300">Explore</Link>
            <Link href="/pricing" className="hover:text-emerald-300">Pricing</Link>
            <Link href="/about" className="hover:text-emerald-300">About</Link>
            <Link href="/auth/signin" className="font-semibold text-emerald-300">Sign In</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto min-h-[60vh] max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:leading-tight sm:[&_h1]:text-4xl [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_p]:mt-4 [&_p]:max-w-3xl [&_p]:leading-7 [&_p]:text-neutral-300">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}