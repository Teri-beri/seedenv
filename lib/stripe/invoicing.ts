import type Stripe from "stripe";
import { TransactionStatus, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { SEEDENV_LEGAL_ENTITY, legalDisclosureLines } from "@/lib/legal-entity";

const RECEIPT_TYPES = [TransactionType.ESCROW_DEPOSIT, TransactionType.BALANCE_TOPUP];

// Stripe bills a per-invoice fee for Checkout invoices; set STRIPE_CHECKOUT_INVOICES=off to opt out.
export function checkoutInvoicesEnabled() {
  return process.env.STRIPE_CHECKOUT_INVOICES?.trim().toLowerCase() !== "off";
}

export function checkoutInvoiceCreation(input: { description: string; metadata: Record<string, string> }): Pick<Stripe.Checkout.SessionCreateParams, "invoice_creation"> {
  if (!checkoutInvoicesEnabled()) return {};
  return {
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: input.description.slice(0, 1500),
        footer: legalDisclosureLines().join("\n").slice(0, 5000),
        custom_fields: [
          { name: "Seller", value: SEEDENV_LEGAL_ENTITY.name },
          { name: "FL Document No.", value: SEEDENV_LEGAL_ENTITY.documentNumber },
        ],
        metadata: { ...input.metadata, seedenvInvoice: "1" },
      },
    },
  };
}

export function safeStripeInvoiceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com")) ? url.toString() : null;
  } catch {
    return null;
  }
}

function invoiceCache(invoice: Pick<Stripe.Invoice, "hosted_invoice_url" | "invoice_pdf">) {
  return { hostedInvoiceUrl: safeStripeInvoiceUrl(invoice.hosted_invoice_url), invoicePdfUrl: safeStripeInvoiceUrl(invoice.invoice_pdf) };
}

function stripeId(value: string | { id?: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

// Links the Checkout-generated invoice to the settled receipt row. Never throws: receipts must not block settlement.
export async function linkCheckoutInvoice(session: { invoice?: string | Stripe.Invoice | null }, paymentIntentId: string | null | undefined) {
  const invoiceId = stripeId(session.invoice);
  if (!invoiceId || !paymentIntentId) return { linked: 0 };
  const where = { stripePaymentId: paymentIntentId, type: { in: RECEIPT_TYPES }, status: TransactionStatus.COMPLETED, OR: [{ stripeInvoiceId: null }, { stripeInvoiceId: invoiceId }] };
  try {
    const { count } = await prisma.walletTransaction.updateMany({ where, data: { stripeInvoiceId: invoiceId } });
    if (!count) return { linked: 0 };
    try {
      const invoice = await getStripe().invoices.retrieve(invoiceId);
      await prisma.walletTransaction.updateMany({ where: { ...where, stripeInvoiceId: invoiceId }, data: invoiceCache(invoice) });
    } catch (error) {
      console.warn("SeedEnv could not cache Stripe invoice links yet:", invoiceId, error instanceof Error ? error.message : error);
    }
    return { linked: count };
  } catch (error) {
    console.error("SeedEnv could not link the Stripe invoice to its receipt:", invoiceId, error);
    return { linked: 0 };
  }
}

// invoice.finalized / invoice.paid: covers invoices that finalize after the Checkout webhook ran.
export async function handleInvoiceEvent(invoiceId: string) {
  const stripe = getStripe();
  const invoice = await stripe.invoices.retrieve(invoiceId);
  if (invoice.metadata?.seedenvInvoice !== "1" || !invoice.id) return { ignored: true };
  const payments = await stripe.invoicePayments.list({ invoice: invoice.id, limit: 10 });
  const paymentIntentIds = payments.data
    .filter((payment) => payment.status === "paid")
    .map((payment) => stripeId(payment.payment.payment_intent))
    .filter((id): id is string => Boolean(id));
  if (!paymentIntentIds.length) return { awaitingPayment: true };
  const { count } = await prisma.walletTransaction.updateMany({
    where: { stripePaymentId: { in: paymentIntentIds }, type: { in: RECEIPT_TYPES }, status: TransactionStatus.COMPLETED, OR: [{ stripeInvoiceId: null }, { stripeInvoiceId: invoice.id }] },
    data: { stripeInvoiceId: invoice.id, ...invoiceCache(invoice) },
  });
  return { invoiceLinked: count };
}

// Hosted invoice links expire, so resolve a fresh one on every request and fall back to the cached copy.
export async function resolveStripeInvoiceUrl(transaction: { id: string; stripeInvoiceId: string; hostedInvoiceUrl: string | null; invoicePdfUrl: string | null }, view: "hosted" | "pdf") {
  const cached = view === "pdf" ? transaction.invoicePdfUrl : transaction.hostedInvoiceUrl;
  try {
    const invoice = await getStripe().invoices.retrieve(transaction.stripeInvoiceId);
    if (invoice.id !== transaction.stripeInvoiceId) throw new Error("Stripe returned a different invoice.");
    const fresh = invoiceCache(invoice);
    if (fresh.hostedInvoiceUrl !== transaction.hostedInvoiceUrl || fresh.invoicePdfUrl !== transaction.invoicePdfUrl) {
      await prisma.walletTransaction.update({ where: { id: transaction.id }, data: fresh });
    }
    return { url: view === "pdf" ? fresh.invoicePdfUrl : fresh.hostedInvoiceUrl, fresh: true };
  } catch (error) {
    console.warn("SeedEnv could not refresh Stripe invoice links:", transaction.stripeInvoiceId, error instanceof Error ? error.message : error);
    return { url: safeStripeInvoiceUrl(cached), fresh: false };
  }
}
