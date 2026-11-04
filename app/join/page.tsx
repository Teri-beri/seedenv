import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { publicPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = { ...publicPageMetadata("Join the SeedEnv tester network", "Test real apps, submit reproducible bugs and earn testing bounties with SeedEnv.", "/join"), robots: { index: false, follow: true } };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  if (!ref) redirect("/auth/signin?role=TESTER");
  const inviter = /^[a-zA-Z0-9_-]{8,64}$/.test(ref) ? await prisma.user.findFirst({
    where: { id: ref, testerWorkspaceEnabled: true, emailVerified: { not: null } },
    select: { referralCode: true },
  }) : null;
  if (!inviter) return <main id="main-content" className="grid min-h-screen place-items-center bg-[#09090b] p-6 text-zinc-200"><div className="max-w-lg rounded-2xl border border-white/[0.08] bg-zinc-900/50 p-6"><h1 className="text-xl font-semibold">Invite unavailable</h1><p role="alert" className="mt-3 text-sm text-zinc-400">This tester invite is invalid or the inviter has not verified their email. You can still join SeedEnv without a referral.</p><Link href="/auth/signin?role=TESTER" className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-emerald-400 px-4 text-sm font-semibold text-zinc-950">Join the tester network</Link></div></main>;
  redirect(`/auth/signin?${new URLSearchParams({ role: "TESTER", ref: inviter.referralCode })}`);
}
