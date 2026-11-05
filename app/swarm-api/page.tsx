import Link from "next/link";
import { ArrowLeft, ArrowRight, Ban, Clock, Fingerprint, KeyRound, Radar, ShieldCheck, Webhook } from "lucide-react";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { CopyTextButton } from "@/components/ui/copy-text-button";
import { curlExample, nodeExample, responseExample, SWARM_API_ENDPOINT, swarmSignalGlossary, webhookVerifyExample } from "@/lib/swarm-api/docs";
import { SWARM_API_PLAN_IDS, SWARM_API_PLANS } from "@/lib/swarm-api/plans";
import { publicPageMetadata, SITE_URL } from "@/lib/seo";

const title = "SwarmForensics API: Coordinated Comment Spam Detection";
const description = "A comment sanitizer API for developers. Detect copy-paste bot swarms, brigading bursts, and spam floods in real time with allow / review / hold verdicts. Free sandbox, plans from $19/month.";

export const metadata = { ...publicPageMetadata(title, description, "/swarm-api"), robots: { index: true, follow: true } };

const signUpHref = `/auth/signin?callbackUrl=${encodeURIComponent("/account?tab=swarm-api")}`;

const requestFields: ReadonlyArray<[string, string, string]> = [
  ["text", "string, required", "The comment body, up to 5,000 characters. Used to compute a fingerprint and never stored."],
  ["authorId", "string, required", "Your stable ID for the commenter. Hashed with a per-account salt."],
  ["threadId", "string", "The post, video, or thread the comment belongs to. Enables brigade detection."],
  ["commentId", "string", "Your comment ID. Echoed back and shown in the dashboard so you can match flags."],
  ["postedAt", "ISO 8601", "When the comment was posted. Defaults to now; values outside the last 24 hours are clamped."],
  ["authorAccountAgeDays", "number", "Age of the commenter's account. Amplifies other signals for brand-new accounts."],
  ["thresholds", "{ review, hold }", "Override the default scores (40 / 70) that map to review and hold."],
];

const errors: ReadonlyArray<[string, string, string]> = [
  ["400", "invalid_json / invalid_request", "Body is not JSON or a field failed validation."],
  ["401", "unauthorized", "Missing, invalid, or revoked API key."],
  ["413", "payload_too_large", "Body is larger than 20 KB."],
  ["429", "rate_limited", "Per-minute limit hit. Honor the Retry-After header."],
  ["429", "quota_exceeded", "Monthly allowance spent. Checks resume on the 1st (UTC) or after upgrading."],
  ["500", "internal_error", "Temporary failure. Fail open and retry later."],
];

const faqs: ReadonlyArray<[string, string]> = [
  ["Does it filter political opinions?", "No. SwarmForensics never scores what a comment says or which side it takes. It looks only for coordination patterns, such as many accounts posting the same text in a short burst, which works the same for spam, astroturfing, and brigades of any viewpoint."],
  ["Will it delete comments automatically?", "No. The API returns a recommendation. We suggest holding high scores for human review rather than deleting them, because heuristics can produce false positives during genuinely viral moments."],
  ["What data do you store?", "We never store comment text. Each check keeps a short-lived fingerprint (salted hashes of the author, thread, text, and words) for 24 hours so we can spot coordination across comments, then it is deleted automatically."],
  ["What happens when I hit my limit?", "Requests return 429 quota_exceeded with action \"allow\" so your app keeps working. Upgrade any time, or wait for the monthly reset on the 1st (UTC)."],
  ["Is the free paste tool still free?", "Yes. The SwarmForensics paste tool stays free, runs in your browser, and needs no account. The API is for apps that want continuous, automatic screening."],
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebAPI",
      name: "SwarmForensics API",
      description,
      url: `${SITE_URL}/swarm-api`,
      documentation: `${SITE_URL}/swarm-api#reference`,
      provider: { "@id": `${SITE_URL}/#organization` },
      offers: SWARM_API_PLAN_IDS.map((id) => ({ "@type": "Offer", name: SWARM_API_PLANS[id].name, price: (SWARM_API_PLANS[id].priceCents / 100).toFixed(2), priceCurrency: "USD", description: `${SWARM_API_PLANS[id].monthlyChecks.toLocaleString("en-US")} checks per month` })),
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
    },
  ],
};

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="min-w-0">
      <pre className="overflow-x-auto rounded-xl border border-white/[0.08] bg-black/50 p-4 font-mono text-xs leading-5 text-zinc-300"><code>{code}</code></pre>
      <div className="mt-2"><CopyTextButton text={code} label={label} /></div>
    </div>
  );
}

export default function SwarmApiPage() {
  return (
    <main id="main-content" className="min-h-screen bg-[#09090b] px-4 pb-24 pt-6 text-zinc-200 sm:px-6">
      <AnalyticsTracker />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-6xl">
        <nav aria-label="SwarmForensics navigation" className="mb-10 flex items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <Link href="/tools/swarm-detector" className="inline-flex min-h-11 items-center gap-2 font-mono text-xs text-zinc-400 hover:text-emerald-300"><ArrowLeft aria-hidden="true" className="size-4" />Free SwarmForensics tool</Link>
          <Link href="/" className="font-semibold tracking-tight text-zinc-200">SeedEnv<span className="text-emerald-400">.</span></Link>
        </nav>

        <section aria-labelledby="swarm-api-hero" className="max-w-3xl">
          <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-400"><Radar aria-hidden="true" className="size-4" />SwarmForensics API</p>
          <h1 id="swarm-api-hero" className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Stop bot swarms before they hit your comments.</h1>
          <p className="mt-4 text-base leading-7 text-zinc-400">One API call per comment. SwarmForensics compares each new comment against your last 24 hours of activity and flags coordinated copy-paste waves, brigading bursts, and spam floods with a clear <code className="text-zinc-200">allow</code>, <code className="text-zinc-200">review</code>, or <code className="text-zinc-200">hold</code> verdict.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={signUpHref} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-black transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">Get a free sandbox key<ArrowRight aria-hidden="true" className="size-4" /></Link>
            <a href="#reference" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/[0.1] px-5 text-sm font-semibold text-zinc-200 transition hover:border-emerald-500/40 hover:text-emerald-200">API reference</a>
          </div>
          <p className="mt-3 text-xs text-zinc-500">500 free checks every month. No credit card required.</p>
        </section>

        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            { icon: Fingerprint, heading: "Detects coordination, not opinions", body: "Signals come from timing, duplication, and account behavior. The content's viewpoint is never scored." },
            { icon: Clock, heading: "Fast and fail-open", body: "One lightweight call per comment. Every error response still says action: \"allow\", so real users are never blocked by an outage." },
            { icon: ShieldCheck, heading: "No comment text stored", body: "Only salted, text-free fingerprints are kept, and they are deleted automatically after 24 hours." },
          ].map(({ icon: Icon, heading, body }) => (
            <li key={heading} className="rounded-2xl border border-white/[0.08] bg-[#11131A]/80 p-5">
              <Icon aria-hidden="true" className="size-5 text-emerald-400" />
              <h2 className="mt-4 text-base font-semibold text-white">{heading}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
            </li>
          ))}
        </ul>

        <section aria-labelledby="swarm-api-pricing" className="mt-16">
          <h2 id="swarm-api-pricing" className="text-2xl font-semibold text-white">Pricing</h2>
          <p className="mt-2 text-sm text-zinc-400">Monthly plans, cancel any time. Usage resets on the 1st of each month (UTC). Checks stop at your plan limit, so there are no surprise overage bills.</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SWARM_API_PLAN_IDS.map((id) => {
              const plan = SWARM_API_PLANS[id];
              const featured = id === "STARTER";
              return (
                <li key={id} className={`flex flex-col rounded-2xl border p-5 ${featured ? "border-emerald-500/40 bg-emerald-500/[0.05] shadow-[0_0_40px_-20px_rgba(16,185,129,0.6)]" : "border-white/[0.08] bg-[#11131A]/80"}`}>
                  <p className="flex items-center justify-between text-sm font-semibold text-white">{plan.name}{featured ? <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] text-emerald-300">POPULAR</span> : null}</p>
                  <p className="mt-3 text-3xl font-bold text-white">{plan.priceCents ? `$${plan.priceCents / 100}` : "Free"}{plan.priceCents ? <span className="text-sm font-normal text-zinc-500">/mo</span> : null}</p>
                  <ul className="mt-4 flex-1 space-y-1.5 text-sm text-zinc-400">
                    <li>{plan.monthlyChecks.toLocaleString("en-US")} checks / month</li>
                    <li>{plan.perMinute} requests / minute</li>
                    <li>{plan.maxKeys} active API keys</li>
                    <li>{plan.webhooks ? "Signed swarm-alert webhooks" : "Dashboard flags only"}</li>
                  </ul>
                  <Link href={signUpHref} className={`mt-5 inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition ${featured ? "bg-emerald-500 text-black hover:bg-emerald-400" : "border border-white/[0.1] text-zinc-200 hover:border-emerald-500/40 hover:text-emerald-200"}`}>{plan.priceCents ? `Start ${plan.name}` : "Start free"}</Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="swarm-api-quickstart" className="mt-16 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 id="swarm-api-quickstart" className="text-2xl font-semibold text-white">Quickstart</h2>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-zinc-400">
              <li><span className="font-mono text-emerald-300">1.</span> Sign in and open <span className="text-zinc-200">Account → SwarmForensics API</span>.</li>
              <li><span className="font-mono text-emerald-300">2.</span> Create a key and store it as a server-side secret, for example <code className="text-zinc-200">SEEDENV_SWARM_KEY</code>.</li>
              <li><span className="font-mono text-emerald-300">3.</span> Call the API from your backend when a comment is submitted. Publish on <code className="text-zinc-200">allow</code>, queue on <code className="text-zinc-200">review</code>, and hide pending review on <code className="text-zinc-200">hold</code>.</li>
            </ol>
            <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] p-3 text-xs leading-5 text-amber-200"><KeyRound aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Never call the API from browser or mobile code. Anyone could read the key and spend your quota.</p>
          </div>
          <CodeBlock code={nodeExample} label="Copy Node.js" />
        </section>

        <section aria-labelledby="swarm-api-signals" className="mt-16">
          <h2 id="swarm-api-signals" className="text-2xl font-semibold text-white">Signals</h2>
          <p className="mt-2 text-sm text-zinc-400">Each signal adds weight to a 0–100 score. Defaults: 40+ is <code className="text-zinc-200">review</code>, 70+ is <code className="text-zinc-200">hold</code>.</p>
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            {swarmSignalGlossary.map((signal) => (
              <div key={signal.code} className="rounded-xl border border-white/[0.08] bg-[#11131A]/80 p-4">
                <dt className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-100">{signal.label}<code className="font-mono text-[11px] font-normal text-zinc-500">{signal.code}</code></dt>
                <dd className="mt-1 text-sm text-zinc-400">{signal.description}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-zinc-500"><Ban aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Signals are statistical indicators, not proof of automation. Organic viral moments can look bursty, so pair holds with human review.</p>
        </section>

        <section id="reference" aria-labelledby="swarm-api-reference" className="mt-16 scroll-mt-8">
          <h2 id="swarm-api-reference" className="text-2xl font-semibold text-white">API reference</h2>
          <p className="mt-3 break-all font-mono text-sm text-zinc-300"><span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">POST</span> {SWARM_API_ENDPOINT}</p>
          <p className="mt-2 text-sm text-zinc-400">Authenticate with <code className="text-zinc-200">Authorization: Bearer sfk_live_…</code> (or <code className="text-zinc-200">X-API-Key</code>). JSON body up to 20 KB.</p>

          <div className="mt-6 overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Request fields</caption>
              <thead className="bg-white/[0.03] font-mono text-xs uppercase text-zinc-500"><tr><th scope="col" className="px-4 py-2">Field</th><th scope="col" className="px-4 py-2">Type</th><th scope="col" className="px-4 py-2">Description</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">{requestFields.map(([field, type, text]) => <tr key={field}><td className="px-4 py-2 font-mono text-emerald-200">{field}</td><td className="px-4 py-2 font-mono text-xs text-zinc-500">{type}</td><td className="px-4 py-2 text-zinc-400">{text}</td></tr>)}</tbody>
            </table>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="min-w-0"><h3 className="mb-3 text-sm font-semibold text-zinc-300">Request</h3><CodeBlock code={curlExample} label="Copy cURL" /></div>
            <div className="min-w-0"><h3 className="mb-3 text-sm font-semibold text-zinc-300">Response</h3><CodeBlock code={responseExample} label="Copy response" /></div>
          </div>

          <h3 className="mt-10 text-lg font-semibold text-white">Errors</h3>
          <p className="mt-1 text-sm text-zinc-400">Errors use <code className="text-zinc-200">{"{ error: { code, message }, action: \"allow\" }"}</code> so fail-open handling is one line.</p>
          <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="w-full min-w-[560px] text-left text-sm">
              <caption className="sr-only">Error codes</caption>
              <thead className="bg-white/[0.03] font-mono text-xs uppercase text-zinc-500"><tr><th scope="col" className="px-4 py-2">Status</th><th scope="col" className="px-4 py-2">Code</th><th scope="col" className="px-4 py-2">Meaning</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">{errors.map(([status, code, text]) => <tr key={code}><td className="px-4 py-2 font-mono text-zinc-300">{status}</td><td className="px-4 py-2 font-mono text-xs text-amber-200">{code}</td><td className="px-4 py-2 text-zinc-400">{text}</td></tr>)}</tbody>
            </table>
          </div>

          <h3 className="mt-10 flex items-center gap-2 text-lg font-semibold text-white"><Webhook aria-hidden="true" className="size-5 text-emerald-400" />Webhooks</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">On paid plans, add an HTTPS endpoint in your dashboard. When a comment is held we POST a <code className="text-zinc-200">comment.held</code> event with the moderation ID, your comment, thread, and author IDs, the score, signals, and cluster size. Each request carries a <code className="text-zinc-200">SeedEnv-Signature</code> header. Verify it and reject anything older than 5 minutes.</p>
          <div className="mt-4"><CodeBlock code={webhookVerifyExample} label="Copy verifier" /></div>
        </section>

        <section aria-labelledby="swarm-api-privacy" className="mt-16 rounded-2xl border border-white/[0.08] bg-[#11131A]/80 p-6">
          <h2 id="swarm-api-privacy" className="text-xl font-semibold text-white">Privacy & acceptable use</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-zinc-400">
            <li>Comment text is used only to compute a fingerprint and is never stored.</li>
            <li>Fingerprints use a random salt unique to your account, are never shared across customers, and are deleted after 24 hours.</li>
            <li>You are responsible for disclosing automated moderation in your own privacy policy where required.</li>
            <li>The API may not be used to suppress lawful speech based on viewpoint, or to target individuals.</li>
          </ul>
        </section>

        <section aria-labelledby="swarm-api-faq" className="mt-16">
          <h2 id="swarm-api-faq" className="text-2xl font-semibold text-white">FAQ</h2>
          <div className="mt-6 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.08]">
            {faqs.map(([question, answer]) => (
              <details key={question} className="group p-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-zinc-100">{question}<span aria-hidden="true" className="text-zinc-500 transition group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-sm leading-6 text-zinc-400">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-16 flex flex-col items-start justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/[0.08] to-amber-500/[0.05] p-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold text-white">Start screening comments today</h2>
            <p className="mt-1 text-sm text-zinc-400">Free sandbox key in under a minute. Upgrade when your traffic does.</p>
          </div>
          <Link href={signUpHref} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-black transition hover:bg-emerald-400">Get a free sandbox key<ArrowRight aria-hidden="true" className="size-4" /></Link>
        </section>
      </div>
    </main>
  );
}
