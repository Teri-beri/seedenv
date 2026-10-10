import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import AuthCheck from "@/components/AuthCheck";
import { MessageInbox } from "@/components/message-inbox";

export const dynamic = "force-dynamic";
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ box?: string; thread?: string; to?: string; page?: string; before?: string }> }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const query = new URLSearchParams();
    if (params.to) query.set("to", params.to);
    if (params.thread) query.set("thread", params.thread);
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/messages?${query}`)}`);
  }
  const member = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true } });
  if (!member) redirect("/auth/signin");
  return <AuthCheck><main id="main-content" className="terminal-grid min-h-screen bg-[#0A0D12] px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-6xl"><nav className="mb-6 flex flex-wrap gap-5 text-sm text-zinc-400"><Link href={member.role === "TESTER" ? "/dashboard" : "/console"}>Back to workspace</Link><Link href="/account?tab=messages">Account messages</Link><Link href="/#cohorts">Back to landing page</Link></nav><MessageInbox memberId={member.id} params={params} /></div></main></AuthCheck>;
}
