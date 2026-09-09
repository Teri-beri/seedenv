import { getServerSession } from "next-auth";
import Image from "next/image";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { SignInForm } from "@/components/sign-in-form";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect(session.user.role === "DEVELOPER" ? "/console" : "/dashboard");

  return (
    <main className="terminal-grid flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_18%_0%,rgba(109,40,217,0.18),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_52%,#090A0F_100%)] px-4 py-12 text-white">
      <section className="luxury-panel w-full max-w-md rounded-2xl p-6 backdrop-blur-md">
        <div className="mx-auto mb-6 size-14 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80">
          <Image src="/seedenv-logo.svg" alt="SeedEnv" width={56} height={56} priority />
        </div>
        <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-amber-500">SeedEnv secure access</p>
        <h1 className="mt-3 bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-center text-3xl font-black tracking-tight text-transparent">Sign in with email</h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm leading-6 text-neutral-400">Receive a one-time authentication link to access your tester dashboard or developer console.</p>
        <SignInForm />
      </section>
    </main>
  );
}
