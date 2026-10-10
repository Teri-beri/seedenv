import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { blockedBetween, socialMemberSelect } from "@/lib/social-connections";
import { isPublicHandle, publicProfilePath } from "@/lib/public-profile";
import { BlockMemberButton, MessageComposer, RequestReviewButtons } from "@/components/social-controls";
import { MessageReport } from "@/components/message-report";
import { MemberAvatar } from "@/components/member-avatar";
import { MessageRefresh } from "@/components/message-refresh";

const button = "inline-flex min-h-11 items-center rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:text-emerald-300";

export async function MessageInbox({ memberId, params }: { memberId: string; params: { box?: string; thread?: string; to?: string; page?: string; before?: string } }) {
  const box = ["requests", "sent", "archived"].includes(params.box || "") ? params.box : "inbox";
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page || "1", 10) || 1));
  const membership = { OR: [{ participantAId: memberId }, { participantBId: memberId }] };
  const filter = box === "requests" ? { status: "REQUESTED" as const, requesterId: { not: memberId } } : box === "sent" ? { status: "REQUESTED" as const, requesterId: memberId } : { status: box === "archived" ? "DECLINED" as const : "ACCEPTED" as const };
  const threads = await prisma.directConversation.findMany({
    where: { ...membership, ...filter }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 21,
    include: { participantA: { select: socialMemberSelect }, participantB: { select: socialMemberSelect }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } } },
  });
  const pending = await prisma.directConversation.count({ where: { ...membership, status: "REQUESTED", requesterId: { not: memberId } } });
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
  return <section className="space-y-5" aria-label="Private messages">
    <header className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-semibold">Messages</h1><p className="mt-2 text-sm text-zinc-400">Private conversations, not cohort applications or proof reviews.</p></div><Link className={button} href="/account?tab=message-settings">Message settings & blocks</Link></header>
    <nav aria-label="Message folders" className="flex flex-wrap gap-2">{[["inbox", "Inbox"], ["requests", `Requests (${pending})`], ["sent", "Sent requests"], ["archived", "Declined"]].map(([value, label]) => <Link aria-current={box === value ? "page" : undefined} key={value} href={`/messages?box=${value}`} className={`${button} ${box === value ? "border-emerald-400/40 text-emerald-300" : ""}`}>{label}</Link>)}</nav>
    <MessageRefresh />
    <div className="grid min-h-[60vh] gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="min-w-0 rounded-2xl border border-white/10 bg-[#12161F] p-3" aria-label="Conversations">
        {!threads.length ? <p className="p-3 text-sm text-zinc-500">No conversations in this folder.</p> : null}
        {threads.slice(0, 20).map(item => { const member = item.participantAId === memberId ? item.participantB : item.participantA; return <Link key={item.id} className={`mb-2 flex items-center gap-3 rounded-xl border p-3 ${thread?.id === item.id ? "border-emerald-400/30 bg-emerald-400/5" : "border-transparent hover:bg-white/5"}`} href={`/messages?box=${box}&thread=${item.id}`}><MemberAvatar username={member.username} avatarUrl={member.avatarUrl} /><div className="min-w-0"><span className="block break-words text-sm font-semibold">@{member.username}</span><span className="mt-1 line-clamp-2 block break-words text-xs text-zinc-500">{item.messages[0]?.body}</span></div></Link>; })}
        <nav aria-label="Conversation pages" className="flex gap-3 text-xs text-zinc-400">{page > 1 ? <Link href={`/messages?box=${box}&page=${page - 1}`}>Previous</Link> : null}{threads.length > 20 ? <Link href={`/messages?box=${box}&page=${page + 1}`}>Next</Link> : null}</nav>
      </aside>
      <div className="min-w-0 rounded-2xl border border-white/10 bg-[#12161F] p-5">
        {other ? <><header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4"><div className="flex min-w-0 items-center gap-3"><MemberAvatar username={other.username} avatarUrl={other.avatarUrl} /><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{isPublicHandle(other.username) ? <Link href={publicProfilePath(other.username)}>@{other.username}</Link> : other.username}</h2><p className="mt-1 text-xs text-zinc-500">{thread?.status === "ACCEPTED" ? "Connected" : thread?.status === "DECLINED" ? "Request declined" : "Message request"}</p></div></div><BlockMemberButton memberId={other.id} /></header>
          {thread ? <div className="my-5 space-y-3" aria-label="Conversation history">{messages.length > 50 && visible[0] ? <Link className={button} href={`/messages?box=${box}&thread=${thread.id}&before=${visible[0].id}`}>Older messages</Link> : null}{params.before ? <Link className={button} href={`/messages?box=${box}&thread=${thread.id}`}>Latest messages</Link> : null}{visible.map(message => <article key={message.id} className={`max-w-[90%] rounded-2xl border p-3 ${message.senderId === memberId ? "ml-auto border-emerald-400/20 bg-emerald-400/10" : "border-white/10 bg-[#0A0D12]"}`}><p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p><time dateTime={message.createdAt.toISOString()} className="mt-2 block font-mono text-[10px] text-zinc-500">{message.senderId === memberId ? "You" : other.username} / {message.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC</time></article>)}</div> : null}
          {blocked ? <p className="my-5 text-sm text-zinc-400">Messaging is blocked between these accounts.</p> : thread?.status === "REQUESTED" ? thread.requesterId !== memberId ? <section className="my-5 rounded-xl border border-emerald-400/20 p-4"><p className="text-sm text-zinc-300">Accept this request to start a conversation, or decline it to stop further messages.</p><RequestReviewButtons conversationId={thread.id} /></section> : <p className="my-5 text-sm text-zinc-400">Your request is waiting for acceptance. You cannot send another message yet.</p> : thread?.status === "DECLINED" ? <p className="my-5 text-sm text-zinc-400">This request was declined. No more messages can be sent.</p> : !thread && recipient && !recipient.messageRequestsEnabled ? <p className="my-5 text-sm text-zinc-400">This member is not accepting new requests.</p> : <div className="mt-5"><MessageComposer key={other.id} recipientId={other.id} request={!thread} /></div>}
          {thread ? <MessageReport conversationId={thread.id} /> : null}
        </> : <div className="grid min-h-64 place-items-center text-center text-zinc-500"><p>Select a conversation, or open a member&apos;s profile to send a request.</p></div>}
      </div>
    </div>
  </section>;
}
