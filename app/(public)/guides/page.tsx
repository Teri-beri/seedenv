import Link from "next/link";
import { publicPageMetadata } from "@/lib/seo";
import { testingGuides } from "@/lib/testing-guides";

export const metadata = publicPageMetadata("App Beta Testing Guides", "Practical guides to finding beta testers, running an iOS TestFlight beta and planning Google Play closed testing before launch.", "/guides");

export default function TestingGuidesPage() {
  return <>
    <h1>App beta testing guides for developers</h1>
    <p>Plan the test before recruiting the testers. These guides cover build access, audience selection, useful evidence and turning feedback into a release decision.</p>
    <div className="mt-8 grid gap-5">
      {testingGuides.map((guide) => <article key={guide.slug} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h2 className="!mt-0"><Link href={`/guides/${guide.slug}`} className="text-emerald-300 hover:underline">{guide.title}</Link></h2>
        <p>{guide.description}</p>
        <Link href={`/guides/${guide.slug}`} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-300 underline">Read the guide</Link>
      </article>)}
    </div>
    <p>Ready to put a plan into practice? Compare <Link href="/pricing" className="text-emerald-300 underline">cohort pricing</Link> or read the <Link href="/docs" className="text-emerald-300 underline">SeedEnv documentation</Link>.</p>
  </>;
}
