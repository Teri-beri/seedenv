"use client";

import { CheckCircle2, LoaderCircle, ShieldCheck, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type PairResumeState = "securing" | "signin" | "connecting" | "ready" | "error";

export function MobilePairResume({ pairSessionId }: { pairSessionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<PairResumeState>("securing");
  const [message, setMessage] = useState("Securing your encrypted mission link...");

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const token = fragment.get("token");
        if (token) {
          const pendingResponse = await fetch("/api/mission-pair/pending", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: pairSessionId, token }),
            signal: controller.signal,
          });
          const pendingPayload = await pendingResponse.json() as { error?: string };
          if (!pendingResponse.ok) throw new Error(pendingPayload.error || "This pairing link could not be secured.");
          window.history.replaceState(null, "", window.location.pathname);
        }

        setState("connecting");
        setMessage("Connecting this phone to your reserved mission...");
        const response = await fetch(`/api/mission-pair/${encodeURIComponent(pairSessionId)}?connect=1`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json() as { campaignId?: string; error?: string };
        if (response.status === 401) {
          const authResponse = await fetch("/api/auth/session", { cache: "no-store", signal: controller.signal });
          const auth = await authResponse.json() as { user?: { id?: string; role?: string } };
          if (auth.user?.id) throw new Error("Open this link while signed into the tester account that owns the mission.");
          setState("signin");
          setMessage("Sign in once. SeedEnv will return here and resume your existing reserved mission automatically.");
          const callbackUrl = `/pair/${encodeURIComponent(pairSessionId)}`;
          window.setTimeout(() => {
            router.replace(`/auth/signin?role=TESTER&callbackUrl=${encodeURIComponent(callbackUrl)}`);
          }, 900);
          return;
        }
        if (!response.ok || !payload.campaignId) throw new Error(payload.error || "This mission pairing session could not be resumed.");

        setState("ready");
        setMessage("Phone connected. Opening your step-by-step mobile mission guide...");
        window.setTimeout(() => {
          const params = new URLSearchParams({
            view: "missions",
            claim: payload.campaignId as string,
            pair: pairSessionId,
            companion: "1",
          });
          router.replace(`/dashboard?${params.toString()}`);
        }, 700);
      } catch (error) {
        if (controller.signal.aborted) return;
        setState("error");
        setMessage(error instanceof Error ? error.message : "This mission pairing session could not be resumed.");
      }
    })();
    return () => controller.abort();
  }, [pairSessionId, router]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#0A0D12] px-5 py-10 text-white">
      <section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950/85 p-6 shadow-2xl shadow-sky-500/10">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-sky-500/25 bg-sky-500/10 text-sky-300">
          {state === "ready" ? <CheckCircle2 className="size-7" /> : state === "error" ? <ShieldCheck className="size-7 text-rose-300" /> : <Smartphone className="size-7" />}
        </div>
        <p className="mt-5 text-center font-mono text-[10px] uppercase tracking-[0.26em] text-sky-300">SeedEnv Mobile Companion</p>
        <h1 className="mt-3 text-center text-2xl font-semibold tracking-tight">Resume your active mission</h1>
        <p role={state === "error" ? "alert" : "status"} className={`mt-3 text-center text-sm leading-6 ${state === "error" ? "text-rose-300" : "text-zinc-400"}`}>{message}</p>
        {!["ready", "error"].includes(state) ? <LoaderCircle className="mx-auto mt-6 size-6 animate-spin text-emerald-400" /> : null}
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-xs leading-5 text-zinc-500">
          Your original submission, payout, and 24-hour reservation remain unchanged. Pairing only connects this phone to that mission.
        </div>
      </section>
    </main>
  );
}
