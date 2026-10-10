import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTestingGuide, testingGuides } from "@/lib/testing-guides";
import { publicPageMetadata, SITE_URL } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;
export function generateStaticParams() {
  return testingGuides.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = getTestingGuide((await params).slug);
  if (!guide) return { title: "Guide not found", robots: { index: false } };
  const metadata = publicPageMetadata(guide.title, guide.description, `/guides/${guide.slug}`);
  return { ...metadata, openGraph: { ...metadata.openGraph, type: "article" as const } };
}

export default async function TestingGuidePage({ params }: Props) {
  const guide = getTestingGuide((await params).slug);
  if (!guide) notFound();
  const url = `${SITE_URL}/guides/${guide.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", "@id": `${url}#article`, headline: guide.title, description: guide.description, url, mainEntityOfPage: url, inLanguage: "en-US", author: { "@id": `${SITE_URL}/#organization` }, publisher: { "@id": `${SITE_URL}/#organization` }, image: `${SITE_URL}/opengraph-image` },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "SeedEnv", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Testing guides", item: `${SITE_URL}/guides` },
        { "@type": "ListItem", position: 3, name: guide.title, item: url },
      ] },
    ],
  };
  return <article>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap gap-2 text-sm text-zinc-400"><Link href="/" className="hover:text-white">Home</Link><span aria-hidden="true">/</span><Link href="/guides" className="hover:text-white">Testing guides</Link><span aria-hidden="true">/</span><span aria-current="page">{guide.title}</span></nav>
    <h1>{guide.title}</h1>
    <p className="text-sm">By SeedEnv, operated by <Link href="/terimus" className="text-emerald-300 underline">TERIMUS LLC</Link></p>
    <p>{guide.intro}</p>
    {guide.sections.map((section) => <section key={section.title}>
      <h2>{section.title}</h2>
      <p>{section.text}</p>
      {section.checklist ? <ul className="mt-4 max-w-3xl list-disc space-y-2 pl-6 text-neutral-300">{section.checklist.map((item) => <li key={item}>{item}</li>)}</ul> : null}
    </section>)}
    {guide.sources ? <section><h2>Official references</h2><p>Store policies and review requirements can change. Check the source documentation before planning your release.</p><ul className="mt-4 space-y-3">{guide.sources.map((source) => <li key={source.url}><a href={source.url} className="text-emerald-300 underline" target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></section> : null}
    <aside className="mt-10 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
      <h2 className="!mt-0">Put your testing plan into practice</h2>
      <p>Define a focused mission and fund tester rewards. Review the current fees and acceptance policies before launching.</p>
      <div className="mt-5 flex flex-wrap gap-3"><Link href="/pricing" className="rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-black">Compare cohort pricing</Link><Link href="/auth/signin?role=DEVELOPER&callbackUrl=%2Fconsole%3Fview%3Dnew-drop" className="rounded-lg border border-zinc-700 px-4 py-3">Create a testing cohort</Link></div>
    </aside>
    <section><h2>More beta testing guides</h2><ul className="mt-4 space-y-3">{testingGuides.filter((item) => item.slug !== guide.slug).map((item) => <li key={item.slug}><Link href={`/guides/${item.slug}`} className="text-emerald-300 underline">{item.title}</Link></li>)}</ul></section>
  </article>;
}
