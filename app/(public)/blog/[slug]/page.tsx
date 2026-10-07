import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { blogMeta, getPublishedPost, readingMinutes } from "@/lib/growth/blog";
import { publicPageMetadata, SITE_URL } from "@/lib/seo";

export const revalidate = 300;

type Props = { params: Promise<{ slug: string }> };

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPublishedPost((await params).slug).catch(() => null);
  if (!post) return { title: "Post not found", robots: { index: false } };
  const meta = blogMeta(post.metadata);
  const base = publicPageMetadata(post.title, meta.metaDescription ?? meta.excerpt ?? post.title, `/blog/${post.slug}`);
  return { ...base, keywords: meta.tags, openGraph: { ...base.openGraph, type: "article", publishedTime: post.publishedAt?.toISOString(), modifiedTime: post.updatedAt.toISOString() } };
}

export default async function BlogPostPage({ params }: Props) {
  const post = await getPublishedPost((await params).slug).catch(() => null);
  if (!post?.markdownBody) notFound();
  const meta = blogMeta(post.metadata);
  return (
    <article>
      {meta.structuredData ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(meta.structuredData).replace(/</g, "\\u003c") }} /> : null}
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-300"><Link href="/blog" className="hover:underline">Blog</Link>{post.publishedAt ? ` · ${dateFormat.format(post.publishedAt)}` : ""} · {readingMinutes(post.markdownBody)} min read</p>
      <h1 className="mt-3 max-w-3xl">{post.title}</h1>
      <div className="mt-6 max-w-3xl text-neutral-300 [&_a]:text-emerald-300 [&_a]:underline [&_blockquote]:mt-4 [&_blockquote]:border-l-2 [&_blockquote]:border-emerald-500/50 [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-zinc-900 [&_code]:px-1 [&_code]:font-mono [&_code]:text-sm [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_li]:mt-1.5 [&_li]:leading-7 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:mt-4 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-zinc-800 [&_pre]:bg-zinc-950 [&_pre]:p-4 [&_strong]:text-zinc-100 [&_table]:mt-4 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-zinc-800 [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-zinc-800 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-6">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => <h2>{children}</h2>,
            a: ({ href = "", children }) => {
              const internal = href.startsWith("/") || href.startsWith(SITE_URL);
              return internal ? <Link href={href.replace(SITE_URL, "") || "/"}>{children}</Link> : <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>;
            },
            img: () => null,
          }}
        >
          {post.markdownBody}
        </ReactMarkdown>
      </div>
      {meta.faq?.length ? (
        <section className="mt-12 max-w-3xl">
          <h2>Frequently asked questions</h2>
          <div className="mt-4 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40">
            {meta.faq.map((item) => (
              <details key={item.question} className="px-5 py-4">
                <summary className="cursor-pointer text-sm font-medium text-zinc-100">{item.question}</summary>
                <div className="mt-3 text-sm leading-6 text-zinc-400">{item.answer}</div>
              </details>
            ))}
          </div>
        </section>
      ) : null}
      <aside className="mt-12 max-w-3xl rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-6 py-6">
        <p className="!mt-0 text-sm text-zinc-300">Need real testers on your next build? Fund a cohort from a prepaid balance and pay only for approved work.</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
          <Link href="/pricing" className="rounded-lg bg-emerald-500 px-4 py-2 text-black hover:bg-emerald-400">See pricing</Link>
          <Link href="/blog" className="rounded-lg border border-zinc-700 px-4 py-2 text-zinc-200 hover:border-zinc-500">More guides</Link>
        </div>
      </aside>
    </article>
  );
}
