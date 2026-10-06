import Link from "next/link";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata("Contact", "Contact SeedEnv for support, billing, partnerships, and security disclosures.", "/contact");

const channels = [
  { label: "General & partnerships", detail: "Questions about SeedEnv, cohorts, or working with TERIMUS LLC.", href: "mailto:terimus@seedenv.com?subject=SeedEnv%20inquiry", cta: "terimus@seedenv.com" },
  { label: "Account & billing support", detail: "Funding, receipts, refunds of unused rewards, and payout questions. Include your account email and any receipt number.", href: "mailto:terimus@seedenv.com?subject=SeedEnv%20support", cta: "Email support" },
  { label: "Security disclosures", detail: "Report vulnerabilities privately. Do not include exploit details in public channels.", href: "/security", cta: "Disclosure policy" },
  { label: "Platform status", detail: "Check live service health before reporting an outage.", href: "/status", cta: "View status" },
];

export default function ContactPage() {
  return (
    <>
      <h1>Contact SeedEnv</h1>
      <p>We read every message. Signed-in members can also open the in-app Support &amp; Feedback panel from the button in the lower-right corner, or by pressing <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-xs">?</kbd>.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {channels.map((channel) => (
          <div key={channel.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition-colors hover:border-zinc-700">
            <div className="font-mono text-xs uppercase tracking-wider text-zinc-400">{channel.label}</div>
            <div className="mt-2 text-sm leading-6 text-zinc-300">{channel.detail}</div>
            {channel.href.startsWith("mailto:") ? (
              <a href={channel.href} className="mt-4 inline-flex text-sm font-semibold text-emerald-300 hover:text-emerald-200">{channel.cta} →</a>
            ) : (
              <Link href={channel.href} className="mt-4 inline-flex text-sm font-semibold text-emerald-300 hover:text-emerald-200">{channel.cta} →</Link>
            )}
          </div>
        ))}
      </div>
      <h2>Company</h2>
      <div className="mt-4 grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm sm:grid-cols-3">
        <div><div className="font-mono text-xs uppercase tracking-wider text-zinc-500">Legal entity</div><div className="mt-1 text-zinc-200">TERIMUS LLC</div></div>
        <div><div className="font-mono text-xs uppercase tracking-wider text-zinc-500">Jurisdiction</div><div className="mt-1 text-zinc-200">Florida, United States</div></div>
        <div><div className="font-mono text-xs uppercase tracking-wider text-zinc-500">More</div><div className="mt-1 text-zinc-200"><Link href="/terimus" className="hover:text-emerald-300">About TERIMUS LLC</Link></div></div>
      </div>
      <p>Looking for quick answers? See the <Link href="/faq" className="text-emerald-300 underline">FAQ</Link> or the <Link href="/docs" className="text-emerald-300 underline">documentation</Link>.</p>
    </>
  );
}
