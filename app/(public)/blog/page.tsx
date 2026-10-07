import Link from "next/link";
import { blogMeta, listPublishedPosts } from "@/lib/growth/blog";
import { publicPageMetadata } from "@/lib/seo";

export const revalidate = 300;
export const metadata = publicPageMetadata("Blog", "Guides for indie developers on beta testing, TestFlight, Google Play closed testing and shipping better pre-release builds.", "/blog");

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function BlogIndexPage() {
  const posts = await listPublishedPosts();
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-300">SeedEnv Blog</p>
      <h1 className="mt-3">Shipping notes for pre-release builds</h1>
      <p>Practical guides on beta testing, TestFlight, Google Play closed tests and getting real feedback before launch.</p>
      {posts.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-10 text-center text-sm text-zinc-400">
          The first guides are being written. Meanwhile, read the <Link href="/docs" className="text-emerald-300 underline">documentation</Link> or the <Link href="/faq" className="text-emerald-300 underline">FAQ</Link>.
        </div>
      ) : (
        <ul className="mt-10 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40">
          {posts.map((post) => {
            const meta = blogMeta(post.metadata);
            return (
              <li key={post.slug}>
                <Link href={`/blog/${post.slug}`} className="block px-5 py-5 transition hover:bg-zinc-900">
                  <span className="font-mono text-xs text-zinc-500">{post.publishedAt ? dateFormat.format(post.publishedAt) : ""}{meta.tags?.length ? ` · ${meta.tags.slice(0, 3).join(" · ")}` : ""}</span>
                  <span className="mt-1 block text-lg font-semibold text-zinc-100">{post.title}</span>
                  {meta.excerpt ? <span className="mt-1 block text-sm leading-6 text-zinc-400">{meta.excerpt}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
