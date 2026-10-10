import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { platformTag } from "@/lib/billing";
import { isPublicHandle, publicProfilePath, safeExternalUrl } from "@/lib/public-profile";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const socialButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 bg-[#171923] px-4 py-2 text-sm text-zinc-200 hover:border-emerald-400/40";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

async function publicCohort(id: string) {
  return prisma.appCampaign.findFirst({
    where: { id, status: "ACTIVE", cancelledAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true, title: true, description: true, iconUrl: true, platform: true, targetVibe: true,
      bountyPerTaskUsd: true, totalSlots: true, claimedSlots: true, estimatedMinutes: true, guaranteedDays: true,
      instructionRevision: true, hardwareStrict: true, expiresAt: true,
      developer: { select: { id: true, username: true } },
      instructions: { orderBy: { stepNumber: "asc" }, select: { id: true, stepNumber: true, instructionTitle: true, instructionDetail: true, proofType: true, minimumRep: true } },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cohort = await publicCohort((await params).id);
  return cohort ? { title: cohort.title, description: cohort.description.slice(0, 160), alternates: { canonical: `/cohorts/${cohort.id}` } } : { title: "Cohort unavailable", robots: { index: false } };
}

export default async function CohortPage({ params }: Props) {
  const cohort = await publicCohort((await params).id);
  if (!cohort) notFound();
  const own = (await getServerSession(authOptions))?.user?.id === cohort.developer.id;
  const icon = safeExternalUrl(cohort.iconUrl);
  const proofNames = { SCREENSHOT: "Screenshot", TEXT_FEEDBACK: "Written feedback", ACTION_LINK: "Evidence link" };
  return <div className="space-y-8">
    <Link href="/#cohorts" className={socialButton}>Back to landing page</Link>
    <header className="flex flex-wrap items-center gap-5">
      <span role="img" aria-label={`${cohort.title} logo`} className="grid size-20 shrink-0 place-items-center rounded-2xl border border-white/10 bg-[#171923] bg-cover bg-center text-3xl text-emerald-300" style={icon ? { backgroundImage: `url(${JSON.stringify(icon)})` } : undefined}>{icon ? null : cohort.title.charAt(0)}</span>
      <div className="min-w-0 flex-1"><span className="font-mono text-xs text-emerald-400">{platformTag(cohort.platform)} / Recruiting</span><h1 className="mt-2 break-words">{cohort.title}</h1><p>By {isPublicHandle(cohort.developer.username) ? <Link className="text-emerald-300 underline" href={publicProfilePath(cohort.developer.username)}>@{cohort.developer.username}</Link> : cohort.developer.username}</p></div>
    </header>
    <section className="rounded-2xl border border-white/10 bg-[#12161F] p-6"><h2 className="!mt-0">Full cohort brief</h2><p className="whitespace-pre-wrap break-words">{cohort.description}</p><dl className="mt-6 grid gap-4 font-mono text-sm sm:grid-cols-2"><div><dt className="text-zinc-500">Reward per approved report</dt><dd className="mt-1 text-emerald-300">${cohort.bountyPerTaskUsd.toFixed(2)}</dd></div><div><dt className="text-zinc-500">Open places</dt><dd className="mt-1">{Math.max(0, cohort.totalSlots - cohort.claimedSlots)} / {cohort.totalSlots}</dd></div><div><dt className="text-zinc-500">Audience</dt><dd className="mt-1 break-words">{cohort.targetVibe}</dd></div><div><dt className="text-zinc-500">Commitment</dt><dd className="mt-1">{cohort.guaranteedDays ? `${cohort.guaranteedDays} days` : cohort.estimatedMinutes ? `About ${cohort.estimatedMinutes} minutes` : "Follow all steps below"}</dd></div></dl>{cohort.hardwareStrict ? <p className="text-sm">Physical devices required; emulators are not eligible.</p> : null}</section>
    <section><h2>Step-by-step directions / version {cohort.instructionRevision}</h2><p>These are the current recruitment directions. Your assignment is locked to the version in effect when the developer accepts you.</p><ol className="mt-5 space-y-4">{cohort.instructions.map(step => <li key={step.id} className="rounded-xl border border-white/10 bg-[#12161F] p-5"><span className="font-mono text-xs text-emerald-400">STEP {step.stepNumber} / {proofNames[step.proofType]} / minimum {step.minimumRep} REP</span><h3 className="mt-2 text-lg font-semibold">{step.instructionTitle}</h3><p className="whitespace-pre-wrap break-words">{step.instructionDetail}</p></li>)}</ol></section>
    <section className="flex flex-wrap gap-3 border-t border-white/10 pt-6">
      {own ? <Link className={`${socialButton} !bg-emerald-500 !text-zinc-950`} href={`/console/cohorts/${cohort.id}/directions`}>Manage your cohort directions</Link> : <><Link className={`${socialButton} !bg-emerald-500 !text-zinc-950`} href={`/messages?to=${encodeURIComponent(cohort.developer.id)}`}>Message developer</Link><Link className={socialButton} href={`/dashboard?view=discover&mission=${encodeURIComponent(cohort.id)}`}>Request to join in Tester workspace</Link></>}
      <Link className={socialButton} href="/#cohorts">Back to landing page</Link>
    </section>
  </div>;
}
