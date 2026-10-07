import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { draftProductUpdate } from "@/app/admin/growth/actions";
import { reviewUrl } from "@/lib/growth/approval";
import { loadGrowthConfig } from "@/lib/growth/config";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Growth Engine", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const platformName: Record<string, string> = { TWITTER: "X", LINKEDIN: "LinkedIn", INSTAGRAM: "Instagram", TIKTOK: "TikTok" };
const statusTone: Record<string, string> = { PENDING_APPROVAL: "text-amber-300", MANUAL: "text-sky-300", QUEUED: "text-emerald-300", PUBLISHED: "text-emerald-400", REJECTED: "text-zinc-500", FAILED: "text-red-300" };

export default async function AdminGrowthPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=%2Fadmin%2Fgrowth");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (user?.role !== "ADMIN") redirect("/");

  const { ok, error } = await searchParams;
  let config: ReturnType<typeof loadGrowthConfig> | null = null;
  try {
    config = loadGrowthConfig();
  } catch {
    config = null;
  }
  const posts = await prisma.socialQueue.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { contentDrop: { select: { title: true } } } });
  const secret = config?.approvalSecret;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 py-10 text-white sm:px-6 lg:px-8">
      <Link href="/admin" className="text-sm text-zinc-400">Back to Admin</Link>
      <h1 className="mt-5 text-3xl font-semibold">Growth Engine</h1>
      <p className="mt-3 text-sm text-zinc-400">
        Describe something that shipped and Gemini drafts X, LinkedIn, Instagram and a TikTok video script. Nothing posts until you approve it.
        {config ? <span className="font-mono text-xs"> · AI {config.llm.mode} · scheduler {config.social.mode === "live" ? "Ayrshare" : "manual posting"}</span> : null}
      </p>
      {!config ? <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">Growth configuration is invalid. Check the GROWTH_* environment variables.</p> : null}
      {!secret ? <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-sm text-amber-200">GROWTH_APPROVAL_SECRET is not set, so review links can&apos;t be generated. Add a 32+ character random value in Render.</p> : null}
      {ok ? <p role="status" className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-sm text-emerald-200">{ok}</p> : null}
      {error ? <p role="alert" className="mt-4 rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-200">{error}</p> : null}

      <form action={draftProductUpdate} className="mt-7 space-y-4 rounded-xl border border-zinc-800 bg-[#0E1017] p-5">
        <label className="block text-sm font-medium" htmlFor="details">What shipped?</label>
        <textarea id="details" name="details" required minLength={20} maxLength={4000} rows={5} placeholder="e.g. Testers now get paid out within 24 hours of an approved report, and developers can see live device telemetry during a drop." className="w-full rounded-lg border border-zinc-700 bg-[#0A0D12] p-3 text-sm text-zinc-100 outline-none focus:border-emerald-500" />
        <label className="block text-sm font-medium" htmlFor="linkUrl">Link (optional, defaults to the homepage)</label>
        <input id="linkUrl" name="linkUrl" type="url" placeholder="https://seedenv.com/pricing" className="w-full rounded-lg border border-zinc-700 bg-[#0A0D12] p-3 text-sm text-zinc-100 outline-none focus:border-emerald-500" />
        <button type="submit" disabled={!config || config.llm.mode === "disabled"} className="min-h-11 rounded-lg bg-emerald-500 px-5 text-sm font-semibold text-black disabled:opacity-50">Draft posts</button>
      </form>

      <h2 className="mt-10 text-lg font-semibold">Recent posts</h2>
      <div className="mt-3 divide-y divide-white/10 border-y border-white/10">
        {posts.map((post) => (
          <article key={post.id} className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-xs">
                <span className="text-zinc-200">{platformName[post.platform] ?? post.platform}</span>
                <span className={`ml-3 ${statusTone[post.status] ?? "text-zinc-400"}`}>{post.status === "MANUAL" ? "READY TO POST" : post.status.replace("_", " ")}</span>
                <span className="ml-3 text-zinc-500">{post.contentDrop ? `article: ${post.contentDrop.title}` : "product update"} · {post.createdAt.toISOString().slice(0, 10)}</span>
              </p>
              {secret && ["PENDING_APPROVAL", "FAILED", "MANUAL"].includes(post.status) ? (
                <a href={reviewUrl(config!.siteUrl, secret, { kind: "social", id: post.id }, "approve")} className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300">{post.status === "MANUAL" ? "Copy & mark posted" : "Review"}</a>
              ) : null}
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-zinc-400">{post.postText}</p>
          </article>
        ))}
        {!posts.length ? <p className="py-8 text-sm text-zinc-400">No posts drafted yet.</p> : null}
      </div>
    </main>
  );
}
