import { UserRole } from "@prisma/client";
import { ShieldCheck, UsersRound, WalletCards } from "lucide-react";
import { getServerSession } from "next-auth";
import Image from "next/image";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import AuthCheck from "@/components/AuthCheck";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  if (session.user.role !== "ADMIN") redirect("/");

  const [users, campaigns, submissions, payouts] = await Promise.all([
    prisma.user.count(),
    prisma.appCampaign.count(),
    prisma.submission.count(),
    prisma.walletTransaction.aggregate({ _sum: { amountCents: true } }),
  ]);

  return (
    <AuthCheck role="ADMIN">
      <main className="terminal-grid min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(109,40,217,0.2),transparent_28%),radial-gradient(circle_at_88%_8%,rgba(245,158,11,0.12),transparent_24%),linear-gradient(180deg,#090A0F_0%,#10131C_50%,#090A0F_100%)] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative size-12 overflow-hidden rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 shadow-lg shadow-amber-500/10">
                <Image src="/seedenv-logo.svg" alt="SeedEnv" fill sizes="48px" priority />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-amber-500">SeedEnv</p>
                <h1 className="text-xl font-semibold text-neutral-100">Private Admin Control</h1>
              </div>
            </div>
            <span className="rounded-full border border-violet-500/30 bg-violet-950/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-100">
              {UserRole.ADMIN}
            </span>
          </header>

          <section className="mt-14 max-w-4xl">
            <p className="text-xs uppercase tracking-[0.28em] text-amber-500">Internal operations</p>
            <h2 className="mt-3 bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-5xl font-black leading-[0.98] tracking-tight text-transparent sm:text-6xl">
              Admin tools stay private.
            </h2>
            <p className="mt-5 text-lg leading-8 text-neutral-400">
              This endpoint is not linked from public navigation and is only available to authenticated SeedEnv administrators.
            </p>
          </section>

          <section className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <AdminMetric label="Users" value={users.toLocaleString()} icon={<UsersRound className="size-5" />} />
            <AdminMetric label="Campaigns" value={campaigns.toLocaleString()} icon={<ShieldCheck className="size-5" />} />
            <AdminMetric label="Submissions" value={submissions.toLocaleString()} icon={<ShieldCheck className="size-5" />} />
            <AdminMetric label="Ledger volume" value={`$${((payouts._sum.amountCents || 0) / 100).toFixed(2)}`} icon={<WalletCards className="size-5" />} />
          </section>
        </div>
      </main>
    </AuthCheck>
  );
}

function AdminMetric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-md transition-all hover:border-violet-500/30">
      <div className="text-amber-500">{icon}</div>
      <p className="mt-4 text-xs uppercase tracking-[0.18em] text-neutral-500">{label}</p>
      <p className="mt-2 font-mono text-2xl font-black text-white">{value}</p>
    </div>
  );
}
