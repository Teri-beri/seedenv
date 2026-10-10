import Link from "next/link";
import { requirePromoOperator } from "@/lib/cohort-promos";
import { prisma } from "@/lib/prisma";
import { ProofReviewResolution } from "@/components/proof-review-resolution";
import { recordingHref } from "@/lib/recording";

export const dynamic = "force-dynamic";

export default async function ProofReviewsPage() {
  await requirePromoOperator();
  const cases = await prisma.submission.findMany({
    where: { denialReviewPending: true, status: "PENDING" },
    orderBy: { denialRequestedAt: "asc" }, take: 100,
    include: { campaign: { include: { instructions: { orderBy: { stepNumber: "asc" } } } }, tester: { select: { username: true } } },
  });
  return <main className="min-h-screen bg-[#0A0D12] p-6 text-white"><div className="mx-auto max-w-4xl space-y-6">
    <Link href="/console">Back to console</Link>
    <h1 className="text-2xl font-semibold">Denied proof: manual review</h1>
    <p className="text-zinc-400">Oldest 100 open cases. Only this work&apos;s unpaid reward is held. Review the original instructions, evidence, and any 14-day participation requirements before deciding. Previously paid earnings are not reversed.</p>
    {cases.map((item) => <article key={item.id} className="rounded-xl border border-zinc-700 p-5">
      <h2 className="font-semibold">{item.campaign.title} - @{item.tester.username}</h2>
      <p className="mt-2 text-amber-300">${(item.payoutCents / 100).toFixed(2)} held; developer reason: {item.rejectionReason}</p>
      <p className="mt-2 text-sm text-zinc-400">Cohort: {item.campaign.cohortType}; required period: {item.campaign.guaranteedDays ?? "See instructions"} days. Submitted: {item.submittedAt?.toISOString() ?? "Not recorded"}. Review requested: {item.denialRequestedAt?.toISOString() ?? "Not recorded"}.</p>
      <p className="mt-2 whitespace-pre-wrap">{item.campaign.description}</p>
      <ul className="mt-3 space-y-2">{item.campaign.instructions.map((task) => <li key={task.id}>{task.stepNumber}. {task.instructionTitle}: {task.instructionDetail}</li>)}</ul>
      <p className="mt-3 whitespace-pre-wrap">{item.feedbackText}</p>
      {item.proofImageUrl ? <Link className="mr-4 underline" href={`/api/submissions/${item.id}/proof`} target="_blank">Open original proof</Link> : null}
      {item.recordingUrl ? <Link className="underline" href={recordingHref(item.id, item.recordingUrl)!} target="_blank" rel="noopener noreferrer">Open recording</Link> : null}
      <p className="mt-3 text-sm text-zinc-400">Device: {item.deviceModel || "Not supplied"}; OS: {item.osBuild || "Not supplied"}; app build: {item.appBuildVersion || "Not supplied"}</p>
      {item.crashLogs || item.networkLogs ? <details className="mt-3"><summary>Tester logs</summary><pre className="mt-2 whitespace-pre-wrap break-all text-xs">{item.crashLogs}{item.crashLogs && item.networkLogs ? "\n\n" : ""}{item.networkLogs}</pre></details> : null}
      <ProofReviewResolution id={item.id} />
    </article>)}
    {!cases.length ? <p>No denied work awaiting review.</p> : null}
  </div></main>;
}
