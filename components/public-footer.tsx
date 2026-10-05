import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="mx-auto mt-12 flex max-w-7xl flex-wrap items-center justify-between gap-6 border-t border-white/10 px-4 py-8 text-sm text-neutral-400 sm:px-6 lg:px-8">
      <Link href="/" className="font-semibold text-white">SeedEnv</Link>
      <nav aria-label="Public pages" className="flex flex-wrap gap-x-6 gap-y-3">
        <Link href="/explore" className="hover:text-white">Explore</Link>
        <Link href="/pricing" className="hover:text-white">Pricing</Link>
        <Link href="/about" className="hover:text-white">About</Link>
        <Link href="/terms" className="hover:text-white">Terms</Link>
        <Link href="/privacy" className="hover:text-white">Privacy</Link>
      </nav>
    </footer>
  );
}