import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Search, Settings } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { blockedBetween, socialMemberSelect } from "@/lib/social-connections";
import { isPublicHandle, publicProfilePath } from "@/lib/public-profile";
import { BlockMemberButton, MessageComposer, RequestReviewButtons } from "@/components/social-controls";
import { MessageReport } from "@/components/message-report";
import { MemberAvatar } from "@/components/member-avatar";
import { MessageRefresh } from "@/components/message-refresh";
import { CohortContactPicker, type CohortContact } from "@/components/console/messages/CohortContactPicker";

const tabButton = "inline-flex min-h-11 items-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200";
const actionButton = "inline-flex min-h-11 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100";

export async function MessageInbox({ memberId, params, contacts = [] }: { memberId: string; params: { box?: string; thread?: string; to?: string; page?: string; before?: string; q?: string }; contacts?: CohortContact[] }) {
  const box = ["requests", "sent", "archived"].includes(params.box || "") ? params.box : "inbox";
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page || "1", 10) || 1));
  const searchQuery = (params.q || "").trim();
  const membership = { OR: [{ participantAId: memberId }, { participantBId: memberId }] };
  const filter = box === "requests" ? { status: "REQUESTED" as const, requesterId: { not: memberId } } : box === "sent" ? { status: "REQUESTED" as const, requesterId: memberId } : { status: box === "archived" ? "DECLINED" as const : "ACCEPTED" as const };
  const threadWhere = searchQuery ? {
    ...filter,
    AND: [
      membership,
      {
        OR: [
          { participantAId: memberId, participantB: { username: { contains: searchQuery, mode: "insensitive" as const } } },
          { participantBId: memberId, participantA: { username: { contains: searchQuery, mode: "insensitive" as const } } },
        ],
      },
    ],
  } : { ...membership, ...filter };
  const [threads, pending, inboxCount] = await Promise.all([
    prisma.directConversation.findMany({
      where: threadWhere, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 21,
      include: { participantA: { select: socialMemberSelect }, participantB: { select: socialMemberSelect }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } } },
    }),
    prisma.directConversation.count({ where: { ...membership, status: "REQUESTED", requesterId: { not: memberId } } }),
    prisma.directConversation.count({ where: { ...membership, status: "ACCEPTED" } }),
  ]);
  let thread = params.thread ? await prisma.directConversation.findFirst({ where: { id: params.thread, ...membership }, include: { participantA: { select: socialMemberSelect }, participantB: { select: socialMemberSelect } } }) : null;
  if (params.thread && !thread) notFound();
  const recipient = params.to ? await prisma.user.findFirst({ where: { id: params.to, NOT: { email: { endsWith: "@seedenv.dev" } } }, select: { ...socialMemberSelect, messageRequestsEnabled: true } }) : null;
  if (params.to && (!recipient || recipient.id === memberId)) notFound();
  if (!thread && recipient) thread = await prisma.directConversation.findFirst({ where: { ...membership, AND: [{ OR: [{ participantAId: recipient.id }, { participantBId: recipient.id }] }] }, include: { participantA: { select: socialMemberSelect }, participantB: { select: socialMemberSelect } } });
  const other = thread ? thread.participantAId === memberId ? thread.participantB : thread.participantA : recipient;
  const blocked = other ? await blockedBetween(prisma, memberId, other.id) : false;
  const before = thread && params.before ? await prisma.directMessage.findFirst({ where: { id: params.before, conversationId: thread.id }, select: { createdAt: true, id: true } }) : null;
  if (params.before && !before) notFound();
  const messages = thread ? await prisma.directMessage.findMany({
    where: { conversationId: thread.id, ...(before ? { OR: [{ createdAt: { lt: before.createdAt } }, { createdAt: before.createdAt, id: { lt: before.id } }] } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, select: { id: true, body: true, senderId: true, createdAt: true },
  }) : [];
  const visible = messages.slice(0, 50).reverse();
  return <section className="space-y-6" aria-label="Private messages">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-emerald-400/80">developer inbox</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">Direct Messages</h1>
        <p className="mt-2 text-sm text-zinc-400">Direct communication with accepted validators and cohort leads.</p>
      </div>
      <div className="flex items-center gap-2">
        <MessageRefresh />
        <CohortContactPicker contacts={contacts} compact />
        <Link className={`${actionButton} p-2`} href="/account?tab=message-settings" aria-label="Message settings and blocks">
          <Settings aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </header>
    <nav aria-label="Message folders" className="flex flex-wrap gap-2">
      {["inbox", "requests", "sent", "archived"].map((value) => {
        const label = value === "inbox" ? `Inbox (${inboxCount})` : value === "requests" ? `Inquiries (${pending})` : value === "sent" ? "Sent" : "Archived";
        return <Link aria-current={box === value ? "page" : undefined} key={value} href={`/messages?box=${value}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`} className={`${tabButton} ${box === value ? "border-emerald-400/40 bg-emerald-400/5 text-emerald-300" : ""}`}>{label}</Link>;
      })}
    </nav>
    <div className="grid min-h-[650px] gap-4 md:grid-cols-12">
      <aside className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-3 md:col-span-5 lg:col-span-4" aria-label="Conversations">
        <form action="/messages" method="get" className="mb-3 flex gap-2">
          <input type="hidden" name="box" value={box} />
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Filter conversations by validator handle</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
          <input
            aria-label="Filter conversations"
            name="q"
            type="search"
            defaultValue={searchQuery}
            placeholder="Filter by validator handle..."
            className="min-h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-400/50 focus:outline-none"
          />
          </label>
          <button type="submit" className="min-h-10 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white">Search</button>
        </form>
        {!threads.length ? <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 p-4 text-sm text-zinc-500">No conversations in this filter. Validator inquiries will land here.</div> : null}
        {threads.slice(0, 20).map(item => { const member = item.participantAId === memberId ? item.participantB : item.participantA; return <Link key={item.id} className={`mb-2 flex items-center gap-3 rounded-xl border p-3 ${thread?.id === item.id ? "border-emerald-400/30 bg-emerald-400/5" : "border-transparent hover:bg-zinc-900/60"}`} href={`/messages?box=${box}&thread=${item.id}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}><MemberAvatar username={member.username} avatarUrl={member.avatarUrl} /><div className="min-w-0"><span className="block break-words text-sm font-semibold text-zinc-200">@{member.username}</span><span className="mt-1 line-clamp-2 block break-words text-xs text-zinc-500">{item.messages[0]?.body}</span></div></Link>; })}
        <nav aria-label="Conversation pages" className="mt-3 flex gap-3 text-xs text-zinc-400">{page > 1 ? <Link href={`/messages?box=${box}&page=${page - 1}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}>Previous</Link> : null}{threads.length > 20 ? <Link href={`/messages?box=${box}&page=${page + 1}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}>Next</Link> : null}</nav>
      </aside>
      <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 md:col-span-7 lg:col-span-8">
        {other ? <><header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4"><div className="flex min-w-0 items-center gap-3"><MemberAvatar username={other.username} avatarUrl={other.avatarUrl} /><div className="min-w-0"><h2 className="break-words text-lg font-semibold text-zinc-100">{isPublicHandle(other.username) ? <Link href={publicProfilePath(other.username)}>@{other.username}</Link> : other.username}</h2><p className="mt-1 text-xs text-zinc-500">{thread?.status === "ACCEPTED" ? "Connected" : thread?.status === "DECLINED" ? "Request declined" : "Message request"}</p></div></div><BlockMemberButton memberId={other.id} /></header>
          {thread ? <div className="my-5 space-y-3" aria-label="Conversation history">{messages.length > 50 && visible[0] ? <Link className={actionButton} href={`/messages?box=${box}&thread=${thread.id}&before=${visible[0].id}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}>Older messages</Link> : null}{params.before ? <Link className={actionButton} href={`/messages?box=${box}&thread=${thread.id}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}>Latest messages</Link> : null}{visible.map(message => <article key={message.id} className={`max-w-[90%] rounded-2xl border p-3 ${message.senderId === memberId ? "ml-auto border-emerald-400/20 bg-emerald-400/10" : "border-zinc-800 bg-[#0A0D12]"}`}><p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">{message.body}</p><time dateTime={message.createdAt.toISOString()} className="mt-2 block font-mono text-[10px] text-zinc-500">{message.senderId === memberId ? "You" : other.username} / {message.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC</time></article>)}</div> : null}
          {blocked ? <p className="my-5 text-sm text-zinc-400">Messaging is blocked between these accounts.</p> : thread?.status === "REQUESTED" ? thread.requesterId !== memberId ? <section className="my-5 rounded-xl border border-emerald-400/20 p-4"><p className="text-sm text-zinc-300">Accept this request to start a conversation, or decline it to stop further messages.</p><RequestReviewButtons conversationId={thread.id} /></section> : <p className="my-5 text-sm text-zinc-400">Your request is waiting for acceptance. You cannot send another message yet.</p> : thread?.status === "DECLINED" ? <p className="my-5 text-sm text-zinc-400">This request was declined. No more messages can be sent.</p> : !thread && recipient && !recipient.messageRequestsEnabled ? <p className="my-5 text-sm text-zinc-400">This member is not accepting new requests.</p> : <div className="mt-5"><MessageComposer key={other.id} recipientId={other.id} request={!thread} /></div>}
          {thread ? <MessageReport conversationId={thread.id} /> : null}
        </> : <div className="flex h-full min-h-64 flex-col items-center justify-center text-center"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-emerald-400"><MessageCircle aria-hidden="true" className="size-5" /></div><h3 className="text-sm font-medium text-zinc-200">No thread selected</h3><p className="mt-2 max-w-sm text-xs text-zinc-500">Select an open inquiry from the left or contact an accepted validator from an active cohort.</p><CohortContactPicker contacts={contacts} /></div>}
      </div>
    </div>
  </section>;
}
