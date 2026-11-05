"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowUpRight, CheckCircle2, KeyRound, Loader2, Radar, Send, ShieldAlert, Trash2, Webhook } from "lucide-react";
import { CopyTextButton } from "@/components/ui/copy-text-button";
import { nodeExample, swarmSignalGlossary } from "@/lib/swarm-api/docs";
import { PAID_SWARM_API_PLANS, SWARM_API_PLANS, type PaidSwarmApiPlanId } from "@/lib/swarm-api/plans";
import type { SwarmApiDashboard } from "@/lib/swarm-api/service";

type Notice = { tone: "ok" | "error"; text: string } | null;

const card = "rounded-2xl border border-white/[0.08] bg-[#11131A]/90 p-5 sm:p-6";
const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-emerald-500/40 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-60";
const dangerButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:opacity-60";
const signalLabels = new Map(swarmSignalGlossary.map((signal) => [signal.code as string, signal.label]));
const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;
const shortDate = (value: string) => new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message : "Request failed.");
  return data;
}

export function SwarmApiConsole({ dashboard, checkoutNotice }: { dashboard: SwarmApiDashboard; checkoutNotice: Notice }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(checkoutNotice);
  const [keyName, setKeyName] = useState("");
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState(dashboard.webhook.url ?? "");
  const [showSecret, setShowSecret] = useState(false);

  const plan = dashboard.plan;
  const paid = dashboard.billedPlan !== "SANDBOX" && Boolean(dashboard.subscriptionStatus) && dashboard.subscriptionStatus !== "canceled";
  const percent = Math.min(100, Math.round((dashboard.usage.used / Math.max(1, dashboard.usage.limit)) * 100));
  const degraded = paid && plan.id === "SANDBOX";

  async function run(id: string, task: () => Promise<string | void>) {
    setBusy(id);
    setNotice(null);
    try {
      const message = await task();
      if (message) setNotice({ tone: "ok", text: message });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  const checkout = (target: PaidSwarmApiPlanId) => run(`plan-${target}`, async () => {
    const data = await send("/api/swarm-api/subscription", "POST", { action: paid ? "change" : "checkout", plan: target });
    if (data.url) {
      window.location.assign(data.url);
      return;
    }
    return `Switched to ${SWARM_API_PLANS[target].name}. Prorated charges appear on your next invoice.`;
  });

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <p className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-emerald-400"><Radar aria-hidden="true" className="size-4" />SwarmForensics API</p>
        <h1 className="mt-2 text-2xl font-bold text-white">Comment sanitizer for your app</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Send each new comment to one endpoint and get back <code className="text-zinc-200">allow</code>, <code className="text-zinc-200">review</code>, or <code className="text-zinc-200">hold</code> based on coordinated-behavior signals such as copy-paste swarms, burst brigades, and spam floods. Viewpoints are never scored. <Link href="/swarm-api" className="text-emerald-300 underline-offset-4 hover:underline">Read the docs</Link>.</p>
      </header>

      {notice ? <p role={notice.tone === "error" ? "alert" : "status"} className={`rounded-xl border p-4 text-sm ${notice.tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>{notice.text}</p> : null}
      {degraded ? <p role="alert" className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-200"><AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Your subscription is {dashboard.subscriptionStatus?.replace(/_/g, " ")}. Keys keep working at Sandbox limits until payment succeeds.</p> : null}

      <section aria-labelledby="swarm-usage-heading" className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="swarm-usage-heading" className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Plan & usage</h2>
            <p className="mt-2 text-xl font-semibold text-white">{SWARM_API_PLANS[paid ? dashboard.billedPlan as PaidSwarmApiPlanId : "SANDBOX"].name}<span className="ml-2 align-middle text-sm font-normal text-zinc-400">{paid ? `${dollars(SWARM_API_PLANS[dashboard.billedPlan as PaidSwarmApiPlanId].priceCents)}/mo` : "Free"}</span></p>
            {paid && dashboard.currentPeriodEnd ? <p className="mt-1 text-xs text-zinc-500">{dashboard.cancelAtPeriodEnd ? "Ends" : "Renews"} {new Date(dashboard.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p> : null}
          </div>
          {paid ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryButton} disabled={Boolean(busy)} onClick={() => run("portal", async () => { const data = await send("/api/swarm-api/subscription", "POST", { action: "portal" }); window.location.assign(data.url); })}>{busy === "portal" ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}Manage billing</button>
              <button type="button" className={dashboard.cancelAtPeriodEnd ? secondaryButton : dangerButton} disabled={Boolean(busy)} onClick={() => run("cancel", async () => { await send("/api/swarm-api/subscription", "POST", { action: dashboard.cancelAtPeriodEnd ? "resume" : "cancel" }); return dashboard.cancelAtPeriodEnd ? "Subscription resumed." : "Subscription will end at the close of this billing period."; })}>{dashboard.cancelAtPeriodEnd ? "Resume subscription" : "Cancel at period end"}</button>
            </div>
          ) : null}
        </div>
        <div className="mt-5">
          <div className="flex items-baseline justify-between font-mono text-xs text-zinc-400"><span>{dashboard.usage.used.toLocaleString("en-US")} / {dashboard.usage.limit.toLocaleString("en-US")} checks this month</span><span>Resets {new Date(dashboard.usage.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>
          <div role="progressbar" aria-label="Monthly checks used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800"><div className={`h-full rounded-full ${percent >= 90 ? "bg-red-400" : percent >= 70 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${percent}%` }} /></div>
          {percent >= 100 ? <p className="mt-2 text-xs text-red-300">Limit reached. Requests return <code>429 quota_exceeded</code> with <code>action: &quot;allow&quot;</code> until you upgrade or the month resets.</p> : null}
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["Held this month", dashboard.usage.holdCount], ["Sent to review", dashboard.usage.reviewCount], ["Checks (24h)", dashboard.last24h.checks], ["Flagged (24h)", dashboard.last24h.flagged]].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><dt className="text-xs text-zinc-500">{label}</dt><dd className="mt-1 font-mono text-lg text-zinc-100">{Number(value).toLocaleString("en-US")}</dd></div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="swarm-plans-heading" className={card}>
        <h2 id="swarm-plans-heading" className="text-sm font-semibold uppercase tracking-wider text-zinc-500">{paid ? "Change plan" : "Upgrade"}</h2>
        <p className="mt-1 text-sm text-zinc-400">{paid ? "Plan changes take effect immediately and are prorated." : "Sandbox includes 500 checks a month with no card. Paid plans add volume and webhooks."}</p>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {PAID_SWARM_API_PLANS.map((id) => {
            const option = SWARM_API_PLANS[id];
            const current = paid && dashboard.billedPlan === id;
            return (
              <li key={id} className={`flex flex-col rounded-xl border p-4 ${current ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-white/[0.08] bg-black/20"}`}>
                <p className="flex items-center justify-between text-sm font-semibold text-white">{option.name}{current ? <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] text-emerald-300">CURRENT</span> : null}</p>
                <p className="mt-2 text-2xl font-bold text-white">{dollars(option.priceCents)}<span className="text-sm font-normal text-zinc-500">/mo</span></p>
                <p className="mt-1 text-sm text-zinc-400">{option.monthlyChecks.toLocaleString("en-US")} checks · {option.perMinute}/min · {option.maxKeys} keys</p>
                <p className="mt-2 flex-1 text-xs text-zinc-500">{option.blurb}</p>
                <button type="button" className={`${current ? secondaryButton : primaryButton} mt-4`} disabled={current || Boolean(busy)} onClick={() => checkout(id)}>{busy === `plan-${id}` ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}{current ? "Current plan" : paid ? `Switch to ${option.name}` : `Subscribe to ${option.name}`}</button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="swarm-keys-heading" className={card}>
        <h2 id="swarm-keys-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500"><KeyRound aria-hidden="true" className="size-4" />API keys</h2>
        <p className="mt-1 text-sm text-zinc-400">Keys are server-side secrets. Never ship them in browser or mobile code. {plan.name} allows {plan.maxKeys} active keys.</p>
        {revealedKey ? (
          <div role="status" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-4">
            <p className="text-sm font-semibold text-amber-200">Copy this key now. It won&apos;t be shown again.</p>
            <code className="mt-3 block break-all rounded-lg border border-white/[0.08] bg-black/40 p-3 font-mono text-sm text-emerald-200">{revealedKey}</code>
            <div className="mt-3 flex flex-wrap items-start gap-2"><CopyTextButton text={revealedKey} label="Copy key" /><button type="button" className={secondaryButton} onClick={() => setRevealedKey(null)}>I&apos;ve saved it</button></div>
          </div>
        ) : null}
        <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void run("create-key", async () => { const data = await send("/api/swarm-api/keys", "POST", { name: keyName }); setRevealedKey(data.key.secret); setKeyName(""); }); }}>
          <label htmlFor="swarm-key-name" className="sr-only">Key name</label>
          <input id="swarm-key-name" value={keyName} onChange={(event) => setKeyName(event.target.value)} maxLength={60} placeholder="Key name, e.g. production" className="min-h-11 flex-1 rounded-lg border border-white/[0.1] bg-black/30 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none" />
          <button type="submit" className={primaryButton} disabled={Boolean(busy) || dashboard.keys.length >= plan.maxKeys}>{busy === "create-key" ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}Create key</button>
        </form>
        {dashboard.keys.length ? (
          <ul className="mt-4 divide-y divide-white/[0.06] rounded-xl border border-white/[0.06]">
            {dashboard.keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-100">{key.name}</span>
                  <span className="block font-mono text-xs text-zinc-500">{key.prefix}… · created {shortDate(key.createdAt)} · {key.lastUsedAt ? `last used ${shortDate(key.lastUsedAt)}` : "never used"}</span>
                </span>
                <button type="button" className={dangerButton} disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Revoke "${key.name}"? Apps using it will get 401 errors immediately.`)) void run(`revoke-${key.id}`, async () => { await send(`/api/swarm-api/keys/${key.id}`, "DELETE"); return "Key revoked."; }); }}><Trash2 aria-hidden="true" className="size-4" />Revoke</button>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-zinc-500">No active keys yet.</p>}
      </section>

      <section aria-labelledby="swarm-webhook-heading" className={card}>
        <h2 id="swarm-webhook-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500"><Webhook aria-hidden="true" className="size-4" />Swarm alerts webhook</h2>
        {plan.webhooks ? (
          <>
            <p className="mt-1 text-sm text-zinc-400">We POST a signed <code className="text-zinc-200">comment.held</code> event whenever a comment is held, so your team can react without polling.</p>
            <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void run("save-webhook", async () => { await send("/api/swarm-api/webhook", "PUT", { url: webhookUrl }); return "Webhook saved."; }); }}>
              <label htmlFor="swarm-webhook-url" className="sr-only">Webhook URL</label>
              <input id="swarm-webhook-url" type="url" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://api.yourapp.com/webhooks/seedenv" className="min-h-11 flex-1 rounded-lg border border-white/[0.1] bg-black/30 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none" />
              <button type="submit" className={primaryButton} disabled={Boolean(busy) || !webhookUrl.trim()}>{busy === "save-webhook" ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}Save</button>
            </form>
            {dashboard.webhook.url && dashboard.webhook.secret ? (
              <div className="mt-4 space-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-4">
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-zinc-400">
                  <span>Signing secret:</span>
                  <code className="break-all text-zinc-200">{showSecret ? dashboard.webhook.secret : `${dashboard.webhook.secret.slice(0, 10)}••••••••••••`}</code>
                  <button type="button" className="min-h-11 rounded px-2 text-emerald-300 hover:underline" onClick={() => setShowSecret((value) => !value)}>{showSecret ? "Hide" : "Reveal"}</button>
                </div>
                <p className="font-mono text-xs text-zinc-500">Last delivery: {dashboard.webhook.lastAt ? `${dashboard.webhook.lastStatus ? `HTTP ${dashboard.webhook.lastStatus}` : "failed (no response)"} at ${shortDate(dashboard.webhook.lastAt)}` : "none yet"}</p>
                <div className="flex flex-wrap gap-2">
                  <CopyTextButton text={dashboard.webhook.secret} label="Copy secret" />
                  <button type="button" className={secondaryButton} disabled={Boolean(busy)} onClick={() => run("test-webhook", async () => { const data = await send("/api/swarm-api/webhook", "POST", { action: "test" }); return data.delivered ? `Test delivered (HTTP ${data.status}).` : `Test failed${data.status ? ` with HTTP ${data.status}` : ": no response"}.`; })}><Send aria-hidden="true" className="size-4" />Send test</button>
                  <button type="button" className={secondaryButton} disabled={Boolean(busy)} onClick={() => { if (window.confirm("Rotate the signing secret? Update your receiver right away.")) void run("rotate-webhook", async () => { await send("/api/swarm-api/webhook", "POST", { action: "rotate" }); setShowSecret(true); return "Signing secret rotated."; }); }}>Rotate secret</button>
                  <button type="button" className={dangerButton} disabled={Boolean(busy)} onClick={() => run("remove-webhook", async () => { await send("/api/swarm-api/webhook", "DELETE"); setWebhookUrl(""); return "Webhook removed."; })}>Remove</button>
                </div>
              </div>
            ) : null}
          </>
        ) : <p className="mt-2 text-sm text-zinc-400">Webhooks are included with Starter and above.</p>}
      </section>

      <section aria-labelledby="swarm-flags-heading" className={card}>
        <h2 id="swarm-flags-heading" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-500"><ShieldAlert aria-hidden="true" className="size-4" />Flagged in the last 24 hours</h2>
        <p className="mt-1 text-sm text-zinc-400">We never store comment text. Match these to your records by <code className="text-zinc-200">commentId</code>. Fingerprints are deleted after 24 hours.</p>
        {dashboard.recentFlags.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="font-mono text-xs uppercase text-zinc-500"><tr><th scope="col" className="py-2 pr-3">Comment</th><th scope="col" className="py-2 pr-3">Action</th><th scope="col" className="py-2 pr-3">Score</th><th scope="col" className="py-2 pr-3">Signals</th><th scope="col" className="py-2">When</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {dashboard.recentFlags.map((flag) => (
                  <tr key={flag.id}>
                    <td className="py-2 pr-3 font-mono text-xs text-zinc-300">{flag.commentId ?? flag.id}</td>
                    <td className="py-2 pr-3"><span className={`rounded-full border px-2 py-0.5 font-mono text-[11px] ${flag.action === "hold" ? "border-red-500/30 text-red-300" : "border-amber-500/30 text-amber-300"}`}>{flag.action}</span></td>
                    <td className="py-2 pr-3 font-mono text-zinc-200">{flag.score}</td>
                    <td className="py-2 pr-3 text-xs text-zinc-400">{flag.signals.map((code) => signalLabels.get(code) ?? code).join(", ")}</td>
                    <td className="py-2 font-mono text-xs text-zinc-500">{shortDate(flag.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><CheckCircle2 aria-hidden="true" className="size-4 text-emerald-400" />Nothing flagged recently.</p>}
      </section>

      <section aria-labelledby="swarm-quickstart-heading" className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="swarm-quickstart-heading" className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Quickstart (Node.js)</h2>
          <Link href="/swarm-api#reference" className="inline-flex min-h-11 items-center gap-1 text-sm text-emerald-300 hover:underline">Full reference<ArrowUpRight aria-hidden="true" className="size-4" /></Link>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-white/[0.06] bg-black/40 p-4 font-mono text-xs leading-5 text-zinc-300"><code>{nodeExample}</code></pre>
        <div className="mt-3"><CopyTextButton text={nodeExample} label="Copy snippet" /></div>
      </section>
    </div>
  );
}
