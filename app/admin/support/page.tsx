import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth-options";
import { SupportResolutionButton } from "@/components/support-resolution-button";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Support Queue", robots: { index: false, follow: false } };

export default async function AdminSupportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=%2Fadmin%2Fsupport");
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (user?.role !== "ADMIN") redirect("/");
  const tickets = await prisma.supportTicket.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 100, include: { user: { select: { email: true } } } });
  return <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 text-white sm:px-6 lg:px-8"><Link href="/admin" className="text-sm text-zinc-400">Back to Admin</Link><h1 className="mt-5 text-3xl font-semibold">Support Queue</h1><p className="mt-3 text-sm text-zinc-400">Oldest 100 open requests. Contact the member using the recorded account email.</p><div className="mt-7 divide-y divide-white/10 border-y border-white/10">{tickets.map((ticket) => <article key={ticket.id} className="py-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="font-mono text-xs text-emerald-300">{ticket.category} / {ticket.id}</p><h2 className="mt-2 break-words text-lg font-semibold">{ticket.subject}</h2><p className="mt-2 text-sm text-zinc-400">{ticket.user.email} / {ticket.role} / {ticket.createdAt.toISOString()}</p></div><SupportResolutionButton id={ticket.id} /></div><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">{ticket.message}</p><dl className="mt-4 space-y-2 break-all font-mono text-xs text-zinc-500"><div><dt className="inline text-zinc-400">User: </dt><dd className="inline">{ticket.userId}</dd></div><div><dt className="inline text-zinc-400">Route: </dt><dd className="inline">{ticket.route}</dd></div><div><dt className="inline text-zinc-400">Browser / OS: </dt><dd className="inline">{ticket.userAgent}</dd></div></dl></article>)}{!tickets.length ? <p className="py-8 text-sm text-zinc-400">No open support requests.</p> : null}</div></main>;
}