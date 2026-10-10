"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveProofDenial } from "@/app/actions/proofReviewActions";

export function ProofReviewResolution({ id }: { id: string }) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function resolve(decision: "approve" | "deny") {
    startTransition(async () => {
      try {
        const result = await resolveProofDenial(id, decision, note);
        setMessage(result.ok ? result.message : result.error);
        if (!result.ok) return;
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Review failed. Refresh the queue to check whether approval was recorded before retrying a payout.");
      }
    });
  }
  return <div className="mt-4 space-y-3">
    <label className="block text-sm">Manual review findings<textarea className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 p-3" minLength={12} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} /></label>
    <div className="flex gap-3">
      <button disabled={pending || note.trim().length < 12} onClick={() => resolve("approve")} className="rounded bg-emerald-600 px-4 py-2 disabled:opacity-50">Approve work and release reward</button>
      <button disabled={pending || note.trim().length < 12} onClick={() => resolve("deny")} className="rounded border border-rose-500 px-4 py-2 disabled:opacity-50">Confirm denial</button>
    </div>
    {message ? <p role="alert">{message}</p> : null}
  </div>;
}
