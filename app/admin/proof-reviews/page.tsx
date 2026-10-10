import Link from "next/link";
import { requirePromoOperator } from "@/lib/cohort-promos";
import { prisma } from "@/lib/prisma";
import { ProofReviewResolution } from "@/components/proof-review-resolution";
import { recordingHref } from "@/lib/recording";
import { versionDirections } from "@/lib/instruction-versions";

export const dynamic = "force-dynamic";

export default async function ProofReviewsPage() {
  await requirePromoOperator();
  const cases = await prisma.submission.findMany({
    where: { denialReviewPending: true, status: "PENDING" },
    orderBy: { denialRequestedAt: "asc" }, take: 100,
    include: { instructionVersion: true, campaign: { include: { instructionVersions: { orderBy: { revision: "asc" } } } }, tester: { select: { username: true } } },
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
      <h3 className="mt-4 font-semibold">Assigned instructions: version {item.instructionVersion?.revision ?? "missing"}</h3>
      {!item.instructionVersion ? <p role="alert" className="text-rose-300">No assigned version is recorded. Investigate before deciding; do not substitute current directions.</p> : <><p className="mt-2 text-xs text-zinc-400">Saved {item.instructionVersion.createdAt.toISOString()}; developer account {item.instructionVersion.editedById}</p><ul className="mt-3 space-y-2">{versionDirections(item.instructionVersion).map((task) => <li key={task.id} className="whitespace-pre-wrap break-words">{task.stepNumber}. {task.instructionTitle}: {task.instructionDetail} (proof: {task.proofType})</li>)}</ul></>}
      <details className="mt-4"><summary>Full instruction edit history (later versions do not apply to this work)</summary>{item.campaign.instructionVersions.map((version) => <section key={version.id} className="mt-4 border-t border-zinc-700 pt-3"><h3>Version {version.revision} - {version.createdAt.toISOString()}</h3><p className="text-xs text-zinc-400">Saved by {version.editedById}</p><ul className="mt-2 space-y-2">{versionDirections(version).map((task) => <li key={task.id} className="whitespace-pre-wrap break-words">{task.stepNumber}. {task.instructionTitle}: {task.instructionDetail}</li>)}</ul></section>)}</details>
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
