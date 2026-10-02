import { createHash } from "node:crypto";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { PasswordChangeForm } from "@/components/password-change-form";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function VerifyPasswordChangePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = params.token || "";
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(`/account/password/verify?token=${token}`)}`);
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const challenge = token
    ? await prisma.verificationToken.findFirst({
        where: {
          identifier: `password-change:${session.user.id}`,
          token: tokenHash,
          expires: { gt: new Date() },
        },
        select: { identifier: true },
      })
    : null;

  return (
    <main className="grid min-h-screen place-items-center bg-[#090A0F] px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-xl border border-[#1F2430] bg-[#0E1017] p-6 shadow-2xl shadow-black/40 sm:p-8">
        {challenge ? (
          <PasswordChangeForm token={token} />
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-500">Password verification</p>
            <h1 className="mt-3 text-2xl font-bold">Link expired or already used</h1>
            <p className="mt-3 text-sm leading-6 text-neutral-400">For your security, this link can only be used once and expires after 15 minutes. Request a new link from Account Security.</p>
            <Link className="mt-6 inline-flex font-semibold text-amber-400 hover:text-amber-300" href="/account?tab=security#security">Return to Account Security</Link>
          </>
        )}
      </section>
    </main>
  );
}