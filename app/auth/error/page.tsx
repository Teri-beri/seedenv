import Image from "next/image";
import Link from "next/link";

const errorCopy: Record<string, string> = {
  EmailSignin: "SeedEnv could not send the authentication email. Check RESEND_API_KEY, AUTH_EMAIL_FROM, and Resend domain verification.",
  Configuration: "SeedEnv authentication is missing required production configuration.",
  Verification: "That sign-in link is expired or has already been used.",
};

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const code = params.error || "Configuration";
  const message = errorCopy[code] || "SeedEnv could not complete authentication. Please try again.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090A0F] px-4 py-12 text-white">
      <section className="w-full max-w-md rounded-xl border border-[#1F2430] bg-[#0E1017] p-10 text-center shadow-2xl shadow-black/40">
        <div className="mx-auto mb-6 size-20 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#090A0F] shadow-lg shadow-amber-500/10">
          <Image src="/seedenv-logo.png" alt="SeedEnv" width={80} height={86} className="scale-125 object-cover" priority />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-red-300">Authentication error</p>
        <h1 className="mt-3 text-3xl font-bold text-amber-500">Email sign-in failed</h1>
        <p className="mt-4 rounded-lg bg-red-950/40 p-4 text-sm leading-6 text-red-200">{message}</p>
        <Link className="mt-6 inline-flex rounded-lg border border-amber-400/30 bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 font-semibold text-neutral-950 shadow-lg shadow-amber-500/10 transition-all hover:from-amber-400 hover:to-amber-500" href="/auth/signin">
          Try again
        </Link>
      </section>
    </main>
  );
}