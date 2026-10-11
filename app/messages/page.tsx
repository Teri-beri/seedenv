import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import AuthCheck from "@/components/AuthCheck";
import { ConsoleHeader } from "@/components/console-header";
import { MessageInbox } from "@/components/message-inbox";
import type { CohortContact } from "@/components/console/messages/CohortContactPicker";

export const dynamic = "force-dynamic";
export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ box?: string; thread?: string; to?: string; page?: string; before?: string; q?: string }> }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const query = new URLSearchParams();
    if (params.to) query.set("to", params.to);
    if (params.thread) query.set("thread", params.thread);
    if (params.q) query.set("q", params.q);
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/messages?${query}`)}`);
  }
  const member = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, username: true, avatarUrl: true, companyName: true } });
  if (!member) redirect("/auth/signin");
  const applications = member.role === "DEVELOPER"
    ? await prisma.missionApplication.findMany({
      where: { campaign: { developerId: member.id, status: "ACTIVE" }, status: { in: ["ACCEPTED", "STARTED"] } },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { tester: { select: { id: true, username: true, avatarUrl: true } }, campaign: { select: { title: true } } },
    })
    : member.role === "TESTER"
      ? await prisma.missionApplication.findMany({
        where: { testerId: member.id, campaign: { status: "ACTIVE" }, status: { in: ["ACCEPTED", "STARTED"] } },
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: { campaign: { select: { title: true, developer: { select: { id: true, username: true, avatarUrl: true } } } } },
      })
      : [];
  const contactMap = new Map<string, CohortContact>();
  for (const application of applications) {
    const contact = "tester" in application ? application.tester : application.campaign.developer;
    if (!contactMap.has(contact.id)) contactMap.set(contact.id, { ...contact, campaignTitle: application.campaign.title });
  }
  const contacts = [...contactMap.values()];
  const consoleAccount = {
    username: member.username || session.user.name || "account",
    avatarUrl: member.avatarUrl || null,
    organization: member.companyName?.trim() || null,
    roleLabel: member.role === "ADMIN" ? "Admin" : member.role === "DEVELOPER" ? "Developer" : "Tester",
    publicProfileHref: null,
  };
  return (
    <AuthCheck>
      <div className="min-h-screen bg-[#07090b] text-zinc-100">
        <ConsoleHeader activeView="messages" paymentsMode={process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"} account={consoleAccount} />
        <main id="main-content" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <MessageInbox memberId={member.id} params={params} contacts={contacts} />
        </main>
      </div>
    </AuthCheck>
  );
}
