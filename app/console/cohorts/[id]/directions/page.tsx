import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/member";
import { prisma } from "@/lib/prisma";
import { versionDirections } from "@/lib/instruction-versions";
import { CohortDirectionsEditor } from "@/components/cohort-directions-editor";

export const dynamic = "force-dynamic";

export default async function CohortDirectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMember("DEVELOPER");
  const { id } = await params;
  const cohort = await prisma.appCampaign.findFirst({
    where: { id, developerId: member.id },
    include: { instructions: { orderBy: { stepNumber: "asc" } }, instructionVersions: { orderBy: { revision: "desc" } } },
  });
  if (!cohort) notFound();
  return <main id="main-content" className="min-h-screen bg-[#0A0D12] px-4 py-10 text-white"><div className="mx-auto max-w-3xl space-y-6">
    <Link href="/console" className="text-emerald-300 underline">Back to console</Link>
    <h1 className="text-2xl font-semibold">{cohort.title}: directions</h1>
    <p className="text-zinc-400">Current version {cohort.instructionRevision}. Each accepted assignment is permanently linked to its own version. Later requirements cannot be used to deny earlier work.</p>
    {cohort.status === "ACTIVE" && cohort.expiresAt > new Date() ? <CohortDirectionsEditor key={cohort.instructionRevision} campaignId={id} revision={cohort.instructionRevision} directions={cohort.instructions} /> : <p>Directions can only be edited while the cohort is active and unexpired.</p>}
    <section id="history" className="space-y-4"><h2 className="text-xl font-semibold">Instruction history</h2>
      <p className="text-sm text-zinc-400">Versions record the developer account ID and UTC save time. Version 1 for existing cohorts is the baseline captured when versioning was introduced, not reconstructed historical edits.</p>
      {!cohort.instructionVersions.length ? <p>The initial directions will be archived when the first tester is accepted or an edit is saved.</p> : null}
      {cohort.instructionVersions.map((version) => <details key={version.id} className="rounded-lg border border-zinc-700 p-4">
        <summary className="cursor-pointer">Version {version.revision} - {version.createdAt.toISOString()}</summary>
        <p className="mt-3 break-all text-xs text-zinc-400">Saved by account: {version.editedById}</p>
        <ol className="mt-4 space-y-4">{versionDirections(version).map((step) => <li key={step.id}><h3 className="font-semibold">{step.stepNumber}. {step.instructionTitle}</h3><p className="mt-2 whitespace-pre-wrap break-words text-zinc-300">{step.instructionDetail}</p><p className="mt-2 text-xs text-zinc-400">Proof: {step.proofType}; REP: {step.minimumRep}</p></li>)}</ol>
      </details>)}
    </section>
  </div></main>;
}
