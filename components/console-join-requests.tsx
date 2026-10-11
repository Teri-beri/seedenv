import Link from "next/link";

export function JoinRequestsCard({ pendingCount }: { pendingCount: number }) {
  const waiting = pendingCount > 0;
  return (
    <section
      aria-labelledby="tester-requests-heading"
      className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5 ${waiting ? "border-emerald-500/25 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/30"}`}
    >
      <div>
        <h2 id="tester-requests-heading" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
          Tester join requests
          <span className={`rounded px-2 py-1 font-mono ${waiting ? "bg-emerald-400/10 text-emerald-300" : "bg-zinc-800/60 text-zinc-400"}`}>{pendingCount}</span>
          {waiting ? <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-emerald-400" /> : null}
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          {waiting ? "Testers are waiting for your decision. Accept or decline their requests in Applications." : "No pending join requests. New requests will appear in Applications."} Join requests are separate from submitted proof reviews.
        </p>
      </div>
      {waiting ? (
        <Link href="/applications#tester-requests" className="inline-flex min-h-11 items-center rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-emerald-300">
          Review tester requests
        </Link>
      ) : (
        <span aria-disabled="true" className="inline-flex min-h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm font-semibold text-zinc-500">
          No requests to review
        </span>
      )}
    </section>
  );
}
