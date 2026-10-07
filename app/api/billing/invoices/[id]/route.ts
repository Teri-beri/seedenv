import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { invoiceSnapshotSchema, invoiceTotalMatches } from "@/lib/enterprise-rules";
import { generateInvoicePdf } from "@/lib/invoice-pdf";

export const runtime = "nodejs";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return new Response("Sign in required.", { status: 401, headers: privateHeaders });
  const { id } = await params;
  const transaction = await prisma.walletTransaction.findFirst({ where: { id, userId: session.user.id, type: { in: ["ESCROW_DEPOSIT", "BALANCE_TOPUP"] }, status: "COMPLETED" } });
  if (!transaction) return new Response("Invoice not found.", { status: 404, headers: privateHeaders });
  const snapshot = invoiceSnapshotSchema.safeParse(transaction.invoiceSnapshot);
  if (!snapshot.success || !invoiceTotalMatches(snapshot.data, transaction.amountCents)) return new Response("This payment needs receipt reconciliation. Contact support.", { status: 409, headers: privateHeaders });
  const bytes = await generateInvoicePdf({ id: transaction.id, date: transaction.createdAt, amountCents: transaction.amountCents, paymentReference: transaction.stripePaymentId || "SeedEnv prepaid balance", snapshot: snapshot.data });
  return new Response(Buffer.from(bytes), { headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="seedenv-invoice-${transaction.id.replace(/[^a-zA-Z0-9_-]/g, "")}.pdf"` } });
  } catch (error) {
    console.error("SeedEnv private invoice generation failed:", error);
    return new Response("Receipt service unavailable. Please try again later.", { status: 503, headers: privateHeaders });
  }
}