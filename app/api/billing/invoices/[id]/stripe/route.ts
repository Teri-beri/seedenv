import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { resolveStripeInvoiceUrl } from "@/lib/stripe/invoicing";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return new Response("Sign in required.", { status: 401, headers: privateHeaders });
    const { id } = await params;
    const view = new URL(request.url).searchParams.get("view") === "pdf" ? "pdf" : "hosted";
    const transaction = await prisma.walletTransaction.findFirst({
      where: { id, userId: session.user.id, type: { in: ["ESCROW_DEPOSIT", "BALANCE_TOPUP"] }, status: "COMPLETED", stripeInvoiceId: { not: null } },
      select: { id: true, stripeInvoiceId: true, hostedInvoiceUrl: true, invoicePdfUrl: true },
    });
    if (!transaction?.stripeInvoiceId) return new Response("Stripe invoice not found.", { status: 404, headers: privateHeaders });
    const { url } = await resolveStripeInvoiceUrl({ ...transaction, stripeInvoiceId: transaction.stripeInvoiceId }, view);
    if (!url) return new Response("Stripe is still finalizing this invoice. Try again in a minute.", { status: 409, headers: privateHeaders });
    return new Response(null, { status: 303, headers: { ...privateHeaders, Location: url, "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    console.error("SeedEnv Stripe invoice lookup failed:", error);
    return new Response("Invoice service unavailable. Please try again later.", { status: 503, headers: privateHeaders });
  }
}
