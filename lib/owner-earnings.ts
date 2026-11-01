import { Prisma, type OwnerPayout } from "@prisma/client";
import type Stripe from "stripe";
import { isDefinitiveStripeRejection } from "@/lib/billing-operations";
import { sendNotificationEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { stripeProcessingCostCents } from "@/lib/pricing";

const DAY_MS = 86_400_000;
const REFUND_KINDS = ["SLOT_REFUND", "PREPAID_REFUND", "PREPAID_BALANCE_REFUND", "WITHDRAWAL", "WITHDRAWAL_REFUND"];
const OPEN_OPERATION_STATES = ["RESERVED", "SUBMITTED", "FAILED"];
const PAYOUT_TIMEZONE = "America/New_York";

function envInt(name: string, fallback: number, min: number, max: number) {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : NaN;
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

export function ownerPayoutPolicy() {
  return {
    holdDays: envInt("OWNER_PAYOUT_HOLD_DAYS", 14, 0, 180),
    reservePercent: envInt("OWNER_PAYOUT_RESERVE_PERCENT", 10, 0, 100),
    reserveWindowDays: envInt("OWNER_PAYOUT_RESERVE_WINDOW_DAYS", 120, 1, 365),
    taxPercent: envInt("OWNER_TAX_SET_ASIDE_PERCENT", 30, 0, 60),
    minimumCents: envInt("OWNER_PAYOUT_MIN_CENTS", 2500, 100, 10_000_000),
    runHour: envInt("OWNER_PAYOUT_HOUR", 10, 0, 23),
  };
}

export type OwnerPayoutPolicy = ReturnType<typeof ownerPayoutPolicy>;

export function ownerPayoutsEnabled() {
  return process.env.NODE_ENV === "production" && Boolean(process.env.STRIPE_SECRET_KEY) && process.env.SEEDENV_DISABLE_OWNER_PAYOUTS !== "1";
}

/** Everything the Stripe balance must still cover, plus the platform income that has matured. All cents. */
export type EarningsInputs = {
  availableCents: number;
  pendingStripeCents: number;
  testerEscrowCents: number;
  pendingTesterPayoutCents: number;
  developerBalancesCents: number;
  clipperEscrowCents: number;
  refundsInFlightCents: number;
  salesTaxCollectedCents: number;
  maturedFeesCents: number;
  immatureFeesCents: number;
  recentFeesCents: number;
  previousOwnerPayoutsCents: number;
};

export type EarningsPlan = EarningsInputs & {
  liabilitiesCents: number;
  reserveCents: number;
  feeHeadroomCents: number;
  balanceHeadroomCents: number;
  payoutCents: number;
  taxSetAsideCents: number;
  keepCents: number;
  belowMinimum: boolean;
};

const nonNegative = (value: number) => Math.max(0, Math.floor(value));

// Pays the smaller of (matured fees not yet paid out) and (balance left after every liability), minus a dispute reserve.
export function planOwnerPayout(inputs: EarningsInputs, policy: OwnerPayoutPolicy): EarningsPlan {
  for (const [key, value] of Object.entries(inputs)) {
    if (!Number.isSafeInteger(value)) throw new Error(`Owner earnings input ${key} is not whole cents.`);
  }
  const liabilitiesCents = nonNegative(inputs.testerEscrowCents) + nonNegative(inputs.developerBalancesCents) + nonNegative(inputs.clipperEscrowCents) + nonNegative(inputs.refundsInFlightCents) + nonNegative(inputs.salesTaxCollectedCents);
  const reserveCents = Math.ceil(nonNegative(inputs.recentFeesCents) * policy.reservePercent / 100);
  const feeHeadroomCents = nonNegative(inputs.maturedFeesCents - inputs.previousOwnerPayoutsCents - reserveCents);
  const balanceHeadroomCents = nonNegative(inputs.availableCents - liabilitiesCents - reserveCents);
  const safeCents = Math.min(feeHeadroomCents, balanceHeadroomCents, nonNegative(inputs.availableCents));
  const belowMinimum = safeCents < policy.minimumCents;
  const payoutCents = belowMinimum ? 0 : safeCents;
  const taxSetAsideCents = Math.round(payoutCents * policy.taxPercent / 100);
  return { ...inputs, liabilitiesCents, reserveCents, feeHeadroomCents, balanceHeadroomCents, payoutCents, taxSetAsideCents, keepCents: payoutCents - taxSetAsideCents, belowMinimum };
}

/** Returns the Friday (in New York) this run belongs to, or null when it is not yet payout time. */
export function payoutWeekKey(now: Date, runHour: number, force = false) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: PAYOUT_TIMEZONE, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((part) => [part.type, part.value]));
  const isoDate = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.weekday === "Fri" && Number(parts.hour) >= runHour) return isoDate;
  return force ? `manual-${isoDate}` : null;
}

function campaignEndedAt(campaign: { status: string; cancelledAt: Date | null; expiresAt: Date; updatedAt: Date }, now: Date) {
  if (campaign.cancelledAt) return campaign.cancelledAt;
  if (campaign.status === "COMPLETED") return campaign.updatedAt < campaign.expiresAt ? campaign.updatedAt : campaign.expiresAt;
  return campaign.expiresAt <= now ? campaign.expiresAt : null;
}

// Reads the live Stripe balance and every ledger obligation. Any failure throws, so no payout is attempted.
export async function gatherEarningsInputs(now: Date, policy: OwnerPayoutPolicy, stripe: Pick<Stripe, "balance">): Promise<EarningsInputs> {
  const balance = await stripe.balance.retrieve();
  const sumUsd = (entries: { amount: number; currency: string }[]) => entries.filter((entry) => entry.currency === "usd").reduce((sum, entry) => sum + entry.amount, 0);
  const matureBefore = new Date(now.getTime() - policy.holdDays * DAY_MS);
  const recentSince = new Date(now.getTime() - policy.reserveWindowDays * DAY_MS);

  const [ledger, campaigns, developerBalances, clipperOpen, clipperPaid, refundOps, salesTax, recentCohortFees, previous] = await Promise.all([
    prisma.walletTransaction.groupBy({
      by: ["campaignId", "type", "status"],
      where: { campaignId: { not: null }, type: { in: ["ESCROW_DEPOSIT", "ESCROW_REFUND", "PLATFORM_FEE", "BOUNTY_PAYOUT"] }, status: { in: ["COMPLETED", "PENDING"] } },
      _sum: { amountCents: true, platformFeeCents: true, taxAmountCents: true },
    }),
    prisma.appCampaign.findMany({ select: { id: true, status: true, cancelledAt: true, expiresAt: true, updatedAt: true } }),
    prisma.user.aggregate({ where: { fundingBalanceCents: { gt: 0 } }, _sum: { fundingBalanceCents: true } }),
    prisma.clipEngagement.aggregate({ where: { fundedAt: { not: null }, paidAt: null, refundId: null }, _sum: { chargeCents: true } }),
    prisma.clipEngagement.findMany({ where: { paidAt: { not: null }, refundId: null }, select: { chargeCents: true, feeCents: true, paidAt: true } }),
    prisma.billingOperation.aggregate({ where: { kind: { in: REFUND_KINDS }, state: { in: OPEN_OPERATION_STATES } }, _sum: { amountCents: true } }),
    prisma.walletTransaction.aggregate({ where: { status: "COMPLETED", createdAt: { gte: recentSince }, taxAmountCents: { gt: 0 } }, _sum: { taxAmountCents: true } }),
    prisma.walletTransaction.aggregate({ where: { type: { in: ["ESCROW_DEPOSIT", "PLATFORM_FEE"] }, status: "COMPLETED", createdAt: { gte: recentSince }, platformFeeCents: { gt: 0 } }, _sum: { platformFeeCents: true } }),
    prisma.ownerPayout.aggregate({ where: { status: { in: ["RESERVED", "SUBMITTED", "PAID"] } }, _sum: { amountCents: true } }),
  ]);

  const perCampaign = new Map<string, { fees: number; stipendIn: number; stipendOut: number; payoutsPending: number }>();
  for (const row of ledger) {
    const id = row.campaignId as string;
    const entry = perCampaign.get(id) ?? { fees: 0, stipendIn: 0, stipendOut: 0, payoutsPending: 0 };
    const amount = row._sum.amountCents ?? 0;
    const fee = row._sum.platformFeeCents ?? 0;
    const tax = row._sum.taxAmountCents ?? 0;
    if (row.type === "ESCROW_DEPOSIT" && row.status === "COMPLETED") { entry.fees += fee; entry.stipendIn += amount - fee - tax; }
    if (row.type === "ESCROW_REFUND" && row.status === "COMPLETED") { entry.fees += fee; entry.stipendOut += amount + fee; }
    if (row.type === "PLATFORM_FEE" && row.status === "COMPLETED") entry.fees += fee;
    if (row.type === "BOUNTY_PAYOUT") {
      if (row.status === "COMPLETED") entry.stipendOut += amount;
      else entry.payoutsPending += amount;
    }
    perCampaign.set(id, entry);
  }

  const endedAt = new Map(campaigns.map((campaign) => [campaign.id, campaignEndedAt(campaign, now)]));
  let testerEscrowCents = 0;
  let pendingTesterPayoutCents = 0;
  let maturedFeesCents = 0;
  let immatureFeesCents = 0;
  for (const [id, entry] of perCampaign) {
    // Pending payouts are still owed out of escrow, so they stay inside the escrow liability.
    testerEscrowCents += Math.max(0, entry.stipendIn - entry.stipendOut, entry.payoutsPending);
    pendingTesterPayoutCents += entry.payoutsPending;
    const ended = endedAt.get(id);
    if (ended && ended <= matureBefore) maturedFeesCents += entry.fees;
    else immatureFeesCents += Math.max(0, entry.fees);
  }
  let recentFeesCents = recentCohortFees._sum.platformFeeCents ?? 0;
  for (const engagement of clipperPaid) {
    // Stripe already deducted its processing cost, so only the remainder is income.
    const fee = Math.max(0, engagement.chargeCents - engagement.feeCents - stripeProcessingCostCents(engagement.chargeCents));
    if (engagement.paidAt && engagement.paidAt <= matureBefore) maturedFeesCents += fee;
    else immatureFeesCents += fee;
    if (engagement.paidAt && engagement.paidAt >= recentSince) recentFeesCents += fee;
  }

  return {
    availableCents: sumUsd(balance.available),
    pendingStripeCents: sumUsd(balance.pending),
    testerEscrowCents,
    pendingTesterPayoutCents,
    developerBalancesCents: developerBalances._sum.fundingBalanceCents ?? 0,
    clipperEscrowCents: clipperOpen._sum.chargeCents ?? 0,
    refundsInFlightCents: refundOps._sum.amountCents ?? 0,
    salesTaxCollectedCents: salesTax._sum.taxAmountCents ?? 0,
    maturedFeesCents: Math.max(0, maturedFeesCents),
    immatureFeesCents,
    recentFeesCents,
    previousOwnerPayoutsCents: previous._sum.amountCents ?? 0,
  };
}

export type OwnerPayoutStripe = Pick<Stripe, "balance" | "payouts">;

export type OwnerPayoutDeps = {
  stripe: OwnerPayoutStripe;
  gather: (now: Date, policy: OwnerPayoutPolicy) => Promise<EarningsInputs>;
  store: {
    find(weekKey: string): Promise<OwnerPayout | null>;
    create(data: { weekKey: string; amountCents: number; taxSetAsideCents: number; status: string; breakdown: Prisma.InputJsonValue; error?: string | null }): Promise<OwnerPayout | null>;
    update(id: string, data: Partial<Pick<OwnerPayout, "status" | "stripePayoutId" | "error" | "notifiedAt">>): Promise<OwnerPayout>;
    unsettled(): Promise<OwnerPayout[]>;
  };
  notify: (payout: OwnerPayout, plan: EarningsPlan | null) => Promise<boolean>;
};

function defaultDeps(): OwnerPayoutDeps {
  const stripe = getStripe();
  return {
    stripe,
    gather: (now, policy) => gatherEarningsInputs(now, policy, stripe),
    store: {
      find: (weekKey) => prisma.ownerPayout.findUnique({ where: { weekKey } }),
      create: async (data) => {
        try {
          return await prisma.ownerPayout.create({ data });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
          throw error;
        }
      },
      update: (id, data) => prisma.ownerPayout.update({ where: { id }, data }),
      unsettled: () => prisma.ownerPayout.findMany({ where: { status: { in: ["RESERVED", "SUBMITTED"] } }, orderBy: { createdAt: "asc" }, take: 20 }),
    },
    notify: notifyOwner,
  };
}

const payoutIdempotencyKey = (weekKey: string) => `seedenv-owner-payout-${weekKey}`;

async function findExistingStripePayout(stripe: OwnerPayoutStripe, row: OwnerPayout) {
  const recent = await stripe.payouts.list({ limit: 100, created: { gte: Math.floor(row.createdAt.getTime() / 1000) - 3600 } });
  return recent.data.find((payout) => payout.metadata?.seedenvOwnerPayoutWeek === row.weekKey) ?? null;
}

// Stripe forgets idempotency keys after 24h; past this age a reserved row is never created blindly.
const RESERVED_RETRY_WINDOW_MS = 20 * 3_600_000;

// Sends (or re-sends after a crash) the Stripe payout for a reserved row. Retries reuse the same key and amount.
async function submitPayout(deps: OwnerPayoutDeps, row: OwnerPayout, now = new Date()) {
  const existing = await findExistingStripePayout(deps.stripe, row);
  if (!existing && now.getTime() - row.createdAt.getTime() > RESERVED_RETRY_WINDOW_MS) {
    // Its balance check is stale, so release it; the next Friday recalculates from fresh numbers.
    return deps.store.update(row.id, { status: "FAILED", error: "Not sent within 20 hours; released for recalculation next Friday." });
  }
  try {
    const payout = existing ?? await deps.stripe.payouts.create(
      { amount: row.amountCents, currency: "usd", description: `SeedEnv owner earnings ${row.weekKey}`, metadata: { seedenvOwnerPayoutWeek: row.weekKey, seedenvOwnerPayoutId: row.id } },
      { idempotencyKey: payoutIdempotencyKey(row.weekKey) },
    );
    if (payout.amount !== row.amountCents) throw new Error(`Stripe payout ${payout.id} amount does not match the reserved owner payout.`);
    return await deps.store.update(row.id, { status: payout.status === "paid" ? "PAID" : payout.status === "failed" || payout.status === "canceled" ? "FAILED" : "SUBMITTED", stripePayoutId: payout.id, error: payout.failure_message ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDefinitiveStripeRejection(error)) return deps.store.update(row.id, { status: "FAILED", error: message });
    await deps.store.update(row.id, { error: message });
    throw error;
  }
}

// Refreshes payouts Stripe has not finished, so failed bank deposits stop counting as already paid.
async function syncUnsettled(deps: OwnerPayoutDeps, now: Date) {
  for (const row of await deps.store.unsettled()) {
    if (row.status === "RESERVED") {
      await submitPayout(deps, row, now).catch((error) => console.warn("SeedEnv owner payout retry failed:", error instanceof Error ? error.message : error));
      continue;
    }
    if (!row.stripePayoutId) continue;
    const payout = await deps.stripe.payouts.retrieve(row.stripePayoutId);
    if (payout.status === "paid") await deps.store.update(row.id, { status: "PAID", error: null });
    else if (payout.status === "failed" || payout.status === "canceled") await deps.store.update(row.id, { status: "FAILED", error: payout.failure_message || `Stripe payout ${payout.status}.` });
  }
}

export type OwnerPayoutRun =
  | { outcome: "disabled" | "not-payout-time" | "blocked" }
  | { outcome: "preview"; weekKey: string | null; plan: EarningsPlan }
  | { outcome: "already-ran"; payout: OwnerPayout }
  | { outcome: "skipped" | "submitted" | "failed"; payout: OwnerPayout; plan: EarningsPlan };

export async function runOwnerPayout(options: { now?: Date; dryRun?: boolean; force?: boolean; enabled?: boolean } = {}, deps: OwnerPayoutDeps = defaultDeps()): Promise<OwnerPayoutRun> {
  const now = options.now ?? new Date();
  const policy = ownerPayoutPolicy();
  const weekKey = payoutWeekKey(now, policy.runHour, options.force || options.dryRun);
  if (options.dryRun) return { outcome: "preview", weekKey, plan: planOwnerPayout(await deps.gather(now, policy), policy) };
  if (!(options.enabled ?? ownerPayoutsEnabled())) return { outcome: "disabled" };
  await syncUnsettled(deps, now);
  if (!weekKey) return { outcome: "not-payout-time" };
  // An unsent reservation is still inside the Stripe balance; paying another week now could spend escrow.
  if ((await deps.store.unsettled()).some((row) => row.status === "RESERVED")) return { outcome: "blocked" };

  const existing = await deps.store.find(weekKey);
  if (existing) return { outcome: "already-ran", payout: existing };

  const plan = planOwnerPayout(await deps.gather(now, policy), policy);
  const row = await deps.store.create({
    weekKey,
    amountCents: plan.payoutCents,
    taxSetAsideCents: plan.taxSetAsideCents,
    status: plan.payoutCents > 0 ? "RESERVED" : "SKIPPED",
    breakdown: { ...plan, policy } as Prisma.InputJsonValue,
    error: plan.payoutCents > 0 ? null : "Nothing above the minimum was safe to pay out this week.",
  });
  if (!row) {
    const winner = await deps.store.find(weekKey);
    if (!winner) throw new Error("Owner payout row vanished during creation.");
    return { outcome: "already-ran", payout: winner };
  }
  if (row.status === "SKIPPED") return { outcome: "skipped", payout: row, plan };

  const submitted = await submitPayout(deps, row);
  if (await deps.notify(submitted, plan).catch(() => false)) await deps.store.update(submitted.id, { notifiedAt: new Date() });
  return { outcome: submitted.status === "FAILED" ? "failed" : "submitted", payout: submitted, plan };
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function ownerEmails() {
  const configured = (process.env.OWNER_EARNINGS_EMAIL || "").split(",").map((email) => email.trim()).filter(Boolean);
  if (configured.length) return configured;
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { email: true }, take: 5 });
  return admins.map((admin) => admin.email);
}

async function notifyOwner(payout: OwnerPayout, plan: EarningsPlan | null) {
  const recipients = await ownerEmails();
  if (!recipients.length) return false;
  const failed = payout.status === "FAILED";
  const lines = failed
    ? [`This week's SeedEnv owner payout of ${usd(payout.amountCents)} was rejected by Stripe.`, `Reason: ${payout.error || "unknown"}`, "", "Nothing left your Stripe balance. Check Stripe > Balances, then the admin Earnings page."]
    : [
      `SeedEnv sent ${usd(payout.amountCents)} of platform earnings to your bank (Stripe payout ${payout.stripePayoutId}).`,
      "",
      `Move ${usd(payout.taxSetAsideCents)} into your tax savings account.`,
      `Yours to keep: ${usd(payout.amountCents - payout.taxSetAsideCents)}.`,
      ...(plan ? [
        "",
        "How it was calculated:",
        `  Stripe available balance: ${usd(plan.availableCents)}`,
        `  Held for testers (escrow + pending payouts): ${usd(plan.testerEscrowCents)}`,
        `  Developer prepaid balances: ${usd(plan.developerBalancesCents)}`,
        `  Clippers escrow: ${usd(plan.clipperEscrowCents)}`,
        `  Refunds in progress: ${usd(plan.refundsInFlightCents)}`,
        `  Sales tax collected (recent): ${usd(plan.salesTaxCollectedCents)}`,
        `  Dispute/refund reserve: ${usd(plan.reserveCents)}`,
        `  Fees still in the hold window (not paid yet): ${usd(plan.immatureFeesCents)}`,
      ] : []),
      "",
      "The tax amount is a set-aside estimate, not tax advice. Confirm the right percentage with an accountant.",
    ];
  const results = await Promise.all(recipients.map((to) => sendNotificationEmail(to, failed ? "SeedEnv owner payout failed" : `SeedEnv paid you ${usd(payout.amountCents)} — set aside ${usd(payout.taxSetAsideCents)} for taxes`, lines.join("\n"), `owner-payout-${payout.id}-${payout.status}-${to}`)));
  return results.some(Boolean);
}

export async function recentOwnerPayouts(take = 12) {
  return prisma.ownerPayout.findMany({ orderBy: { createdAt: "desc" }, take });
}
