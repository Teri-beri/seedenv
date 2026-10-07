import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { MAX_AUDIT_ATTEMPTS } from "@/lib/ai/qa-audit";
import { clearFraudFlag, retryAudit } from "./actions";

export const metadata = { title: "QA Assistant", robots: { index: false, follow: false } };

const submissionSelect = { id: true, feedbackText: true, submittedAt: true, tester: { select: { username: true } }, campaign: { select: { title: true } } } as const;

const weekAgo = () => new Date(Date.now() - 7 * 86_400_000);

export default async function AdminQaPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=%2Fadmin%2Fqa");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (user?.role !== "ADMIN") redirect("/");
  const params = await searchParams;
  const [flagged, failed, counts] = await Promise.all([
    prisma.submissionAudit.findMany({ where: { status: "FLAGGED_FRAUD", humanClearedAt: null, submission: { status: "PENDING" } }, orderBy: { updatedAt: "asc" }, take: 50, include: { submission: { select: submissionSelect } } }),
    prisma.submissionAudit.findMany({ where: { status: "PENDING", submission: { status: "PENDING" } }, orderBy: { updatedAt: "asc" }, take: 50, include: { submission: { select: submissionSelect } } }),
    prisma.submissionAudit.groupBy({ by: ["status"], where: { updatedAt: { gte: weekAgo() } }, _count: { _all: true } }),
  ]);
  const count = (status: string) => counts.find((row) => row.status === status)?._count._all ?? 0;
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 text-white sm:px-6 lg:px-8">
      <Link href="/admin" className="text-sm text-zinc-400">Back to Admin</Link>
      <h1 className="mt-5 text-3xl font-semibold">QA assistant</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">The AI scores every submitted proof for developers. It never approves or rejects. It can ask a tester for missing detail once, and a fraud flag pauses the 48-hour auto-approval until someone clears it here or the developer decides.</p>
      {params.ok ? <p className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-200" role="status">{params.ok}</p> : null}
      {params.error ? <p className="mt-5 rounded-xl border border-rose-500/30 bg-rose-950/30 p-3 text-sm text-rose-200" role="alert">{params.error}</p> : null}
      <dl className="mt-6 grid gap-3 sm:grid-cols-5">
        {(["APPROVED", "NEEDS_CLARIFICATION", "REJECTED", "FLAGGED_FRAUD", "PENDING"] as const).map((status) => (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3" key={status}><dt className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">{status.replaceAll("_", " ")} · 7d</dt><dd className="mt-1 text-2xl font-semibold">{count(status)}</dd></div>
        ))}
      </dl>

      <h2 className="mt-10 text-xl font-semibold">Held for fraud review ({flagged.length})</h2>
      <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
        {flagged.map((audit) => (
          <article className="py-5" key={audit.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-xs text-rose-300">Risk {audit.fraudRiskScore}/100 · {audit.fraudFlags.join(", ") || "no flags"}</p>
                <h3 className="mt-1 font-semibold">{audit.submission.campaign.title} · {audit.submission.tester.username}</h3>
                <p className="mt-1 font-mono text-xs text-zinc-500">{audit.submissionId} · submitted {audit.submission.submittedAt?.toISOString() ?? "n/a"}</p>
              </div>
              <div className="flex gap-2">
                <form action={retryAudit}><input name="submissionId" type="hidden" value={audit.submissionId} /><button className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200" type="submit">Re-run audit</button></form>
                <form action={clearFraudFlag}><input name="submissionId" type="hidden" value={audit.submissionId} /><button className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-black" type="submit">Clear flag</button></form>
              </div>
            </div>
            {audit.fraudExplanation ? <p className="mt-3 text-sm leading-6 text-zinc-300">{audit.fraudExplanation}</p> : null}
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-zinc-500">{audit.submission.feedbackText}</p>
          </article>
        ))}
        {!flagged.length ? <p className="py-6 text-sm text-zinc-400">Nothing is held.</p> : null}
      </div>

      <h2 className="mt-10 text-xl font-semibold">Audits that failed ({failed.length})</h2>
      <p className="mt-1 text-sm text-zinc-500">Retried automatically every 10 minutes, up to {MAX_AUDIT_ATTEMPTS} attempts. Developers review these as normal in the meantime.</p>
      <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
        {failed.map((audit) => (
          <article className="flex flex-wrap items-start justify-between gap-4 py-4" key={audit.id}>
            <div className="min-w-0">
              <h3 className="font-semibold">{audit.submission.campaign.title} · {audit.submission.tester.username}</h3>
              <p className="mt-1 font-mono text-xs text-zinc-500">{audit.submissionId} · attempts {audit.attempts}/{MAX_AUDIT_ATTEMPTS}</p>
              {audit.lastError ? <p className="mt-1 break-words font-mono text-xs text-rose-300">{audit.lastError}</p> : null}
            </div>
            <form action={retryAudit}><input name="submissionId" type="hidden" value={audit.submissionId} /><button className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200" type="submit">Retry now</button></form>
          </article>
        ))}
        {!failed.length ? <p className="py-6 text-sm text-zinc-400">No failed audits.</p> : null}
      </div>
    </main>
  );
}
