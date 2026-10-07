import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { BackButton } from "@/components/back-button";
import { PublicFooter } from "@/components/public-footer";
import { ValidatorJoinWizard, type JoinViewer } from "@/components/validator-join-wizard";
import { prisma } from "@/lib/prisma";
import { rankProgress } from "@/lib/rank";
import { publicPageMetadata } from "@/lib/seo";
import { formatRankLevel, validatorNodeId } from "@/lib/validator-identity";

export const dynamic = "force-dynamic";
export const metadata = publicPageMetadata("Become a Validator", "Test pre-release iOS and Android apps on your own phone and get paid through Stripe for approved proofs.", "/validators/join");

const callbackUrl = "/onboarding?role=TESTER&next=/validators/join";

export default async function ValidatorJoinPage() {
  const session = await getServerSession(authOptions);
  let viewer: JoinViewer = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, username: true, role: true, testerWorkspaceEnabled: true, xpPoints: true, rankTier: true } });
    if (user) {
      const progress = rankProgress(user.rankTier, user.xpPoints);
      viewer = {
        isTester: user.testerWorkspaceEnabled && user.role === "TESTER",
        username: user.username,
        nodeId: validatorNodeId(user.id),
        levelLabel: formatRankLevel(user.rankTier),
        rankLabel: progress.label,
        xp: user.xpPoints,
        percent: progress.percent,
        nextLabel: progress.nextLabel,
        remainingXp: progress.remainingXp,
      };
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0D12] text-zinc-100">
      <header className="border-b border-zinc-800/80">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <Image src="/seedenv-logo-v3.png" alt="" width={24} height={24} className="object-contain" />
            SeedEnv
            <span className="font-mono text-[11px] font-normal uppercase tracking-wider text-zinc-500">Validators</span>
          </Link>
          {viewer ? null : <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="font-mono text-xs text-zinc-400 hover:text-zinc-200">Sign in</Link>}
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
        <BackButton fallbackHref="/" className="-ml-1 mb-8" />
        <div className="mx-auto mb-10 max-w-xl">
          <p className="font-mono text-xs uppercase tracking-wider text-emerald-400">Validator program</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Test unreleased apps. Get paid for proof.</h1>
          <p className="mt-3 text-base leading-relaxed text-zinc-400">Developers fund each cohort through Stripe before it opens. Claim a slot, run the build on your phone, and submit proof. Rewards are released when your proof is approved.</p>
        </div>
        <ValidatorJoinWizard viewer={viewer} callbackUrl={callbackUrl} />
      </main>
      <PublicFooter />
    </div>
  );
}
