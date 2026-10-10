"use server";

import { CampaignStatus, CohortFundingModel, CohortType, PlatformType, TaskProofType, TransactionStatus, TransactionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { COHORT_BUNDLES, COHORT_MIN_PLATFORM_FEE_CENTS, COHORT_PLATFORM_FEE_RATE, isBundleType, MAX_TOP_UP_CENTS, quoteCampaignFunding, quoteSlotCharge, topUpForShortfall } from "@/lib/pricing";
import { billingCompanySnapshot, createTopUpCheckout } from "@/lib/funding-balance";
import { resolveTaskMinimumRep, SEED_TASK_PRESETS } from "@/lib/micro-task-templates";
import { cancelCohort } from "@/lib/slot-funding";
import { formatCents } from "@/lib/utils";
import { serviceTaxAudit, taxLedgerFields, QA_SERVICE_TAX_CODE, stripeTaxEnabled } from "@/lib/billing/tax-policy";
import { seedenvTaxMetadata, storedValueCheckoutTax } from "@/lib/stripe/billing";
import { ensureStripeCustomer } from "@/lib/stripe-customer";
import { CohortPromoError, eligibleCohortPromo, failedCohortPromoCheckout, prepareCohortPromoRetry, promoStackSchema, recordCohortPromoCheckout, reserveCohortPromo } from "@/lib/cohort-promos";
import { billingTransaction } from "@/lib/billing-transaction";
import Stripe from "stripe";
import { queueFollowerEmails } from "@/lib/social-connections";
import { REFERRAL_RULES } from "@/lib/config/referral";
import { releaseUnfundedFeeBenefits, reserveAutomaticFeeBenefits } from "@/lib/services/billing.service";
import { assertTestFlightOwner, isTestFlightUrl, TestFlightOwnershipError } from "@/lib/services/testflight-ownership.service";

const taskInstructionSchema = z.object({
  instructionTitle: z.string().min(3).max(90),
  instructionDetail: z.string().min(12).max(900),
  proofType: z.nativeEnum(TaskProofType),
  minimumRep: z.number().int().min(0).max(1000000).default(0),
  presetId: z.string().max(90).refine((id) => SEED_TASK_PRESETS.some((preset) => preset.id === id), "Unknown testing mission preset.").optional(),
}).transform((instruction) => ({ ...instruction, minimumRep: resolveTaskMinimumRep(instruction) }));

const httpUrlSchema = z.string().url().refine((value) => {
  const protocol = new URL(value).protocol;
  return protocol === "http:" || protocol === "https:";
}, "URL must use HTTP or HTTPS.");

const campaignSchema = z.object({
  title: z.string().min(4).max(90),
  platform: z.nativeEnum(PlatformType),
  appUrl: httpUrlSchema,
  iconUrl: httpUrlSchema.optional().or(z.literal("")),
  targetVibe: z.string().min(3).max(80),
  description: z.string().min(24).max(1400),
  totalSlots: z.number().int().min(5).max(500),
  bountyPerTaskUsd: z.number().min(1).max(100),
  instructions: z.array(taskInstructionSchema).min(1).max(12),
  discoveryAllowed: z.boolean().default(false),
  discoveryMinRep: z.number().int().min(0).max(1000000).default(0),
  cohortType: z.nativeEnum(CohortType).default(CohortType.STANDARD_QA),
  syncGitHubRepo: z.string().trim().regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/, "Use the owner/repo format.").optional().or(z.literal("")),
  hardwareStrict: z.boolean().default(true),
  estimatedMinutes: z.number().int().min(1, "Estimate at least 1 minute.").max(240, "Keep estimates under 4 hours.").nullable().optional(),
  testerPerk: z.string().trim().max(80, "Keep the perk under 80 characters.").optional().or(z.literal("")),
  promoCode: promoStackSchema.optional(),
}).refine((input) => !input.discoveryAllowed || input.discoveryMinRep <= Math.max(...input.instructions.map((item) => item.minimumRep)), {
  message: "The Discovery REP floor cannot exceed the highest task requirement.",
  path: ["discoveryMinRep"],
});

export type CampaignInput = z.infer<typeof campaignSchema>;

// Bundle slots, rewards, fee, and platform are fixed server-side so the client cannot alter a flat-priced package.
function resolveCohortTerms(input: CampaignInput) {
  if (!isBundleType(input.cohortType)) return { totalSlots: input.totalSlots, bountyPerTaskUsd: input.bountyPerTaskUsd, platform: input.platform, guaranteedDays: null };
  const bundle = COHORT_BUNDLES[input.cohortType];
  return {
    totalSlots: bundle.slots,
    bountyPerTaskUsd: bundle.bountyCents / 100,
    platform: bundle.platform ? PlatformType[bundle.platform] : input.platform,
    guaranteedDays: bundle.guaranteedDays,
  };
}

function checkoutDescription(input: CampaignInput, terms: ReturnType<typeof resolveCohortTerms>, platformFeeWaived: boolean, discountPercent: number) {
  if (platformFeeWaived) return `${terms.totalSlots} tester slots at $${terms.bountyPerTaskUsd.toFixed(2)}; platform fee waived`;
  if (discountPercent) return `${terms.totalSlots} tester slots at $${terms.bountyPerTaskUsd.toFixed(2)}; ${discountPercent}% off the platform fee${input.promoCode ? ` with ${input.promoCode}` : " through referral benefits"}`;
  if (isBundleType(input.cohortType)) {
    const bundle = COHORT_BUNDLES[input.cohortType];
    return `${bundle.name}: ${terms.totalSlots} tester slots at $${terms.bountyPerTaskUsd.toFixed(2)} plus a flat $${(bundle.platformFeeCents / 100).toFixed(2)} platform fee`;
  }
  return `${terms.totalSlots} tester slots at $${terms.bountyPerTaskUsd.toFixed(2)} plus a ${COHORT_PLATFORM_FEE_RATE * 100}% platform fee on the tester reward pool (minimum $${(COHORT_MIN_PLATFORM_FEE_CENTS / 100).toFixed(2)})`;
}

function buildCampaignData(input: CampaignInput, developerId: string, status: CampaignStatus, platformFeeWaived: boolean, discountPercent = 0) {
  const terms = resolveCohortTerms(input);
  const testerPayoutPoolUsd = terms.totalSlots * terms.bountyPerTaskUsd;
  const { totalBudgetUsd, platformFeeUsd, escrowTotalCents } = quoteCampaignFunding(testerPayoutPoolUsd, input.cohortType, platformFeeWaived, discountPercent);

  return {
    escrowTotalCents,
    terms,
    data: {
      developerId,
      title: input.title,
      platform: terms.platform,
      appUrl: input.appUrl,
      iconUrl: input.iconUrl || null,
      targetVibe: input.targetVibe,
      description: input.description,
      totalBudgetUsd,
      bountyPerTaskUsd: terms.bountyPerTaskUsd,
      platformFeeUsd,
      platformFeeDiscountPercent: discountPercent,
      promoCodeDraft: input.promoCode || null,
      totalSlots: terms.totalSlots,
      cohortType: input.cohortType,
      guaranteedDays: terms.guaranteedDays,
      syncGitHubRepo: input.syncGitHubRepo || null,
      hardwareStrict: input.hardwareStrict,
      estimatedMinutes: input.estimatedMinutes ?? null,
      testerPerk: input.testerPerk || null,
      discoveryAllowed: input.discoveryAllowed,
      discoveryMinRep: input.discoveryMinRep,
      status,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      instructions: {
        create: input.instructions.map((instruction, index) => ({
          instructionTitle: instruction.instructionTitle,
          instructionDetail: instruction.instructionDetail,
          proofType: instruction.proofType,
          minimumRep: instruction.minimumRep,
          stepNumber: index + 1,
        })),
      },
    },
  };
}

async function requireDeveloper() {
  const developer = await getCurrentUser("DEVELOPER");
  if (developer.role !== "DEVELOPER" && developer.role !== "ADMIN") {
    throw new Error("Only developers can manage SeedEnv drops.");
  }
  return developer;
}

async function saveCampaignDraft(developerId: string, input: CampaignInput, platformFeeWaived: boolean, draftId?: string) {
  const needsOwnership = resolveCohortTerms(input).platform === PlatformType.TESTFLIGHT || isTestFlightUrl(input.appUrl);
  const { data: draftData } = buildCampaignData(input, developerId, CampaignStatus.DRAFT, platformFeeWaived);
  if (!draftId) return billingTransaction(async tx => {
    const draft = await tx.appCampaign.create({ data: draftData });
    if (!needsOwnership) return draft;
    const appUrl = await assertTestFlightOwner(tx, developerId, input.appUrl, draft.id, true);
    return tx.appCampaign.update({ where: { id: draft.id }, data: { appUrl } });
  });

  const ownedDraft = await prisma.appCampaign.findFirst({
    where: { id: draftId, developerId, status: CampaignStatus.DRAFT },
    include: { promoRedemptions: { include: { promoCode: { select: { code: true } } } } },
  });
  if (!ownedDraft) throw new Error("This saved draft is unavailable or already launched.");
  if (ownedDraft.promoRedemptions.length && (input.promoCode || "").split(",").sort().join(",") !== ownedDraft.promoRedemptions.map((entry) => entry.promoCode.code).sort().join(",")) throw new CohortPromoError("Keep this draft's reserved promo codes to resume its funding terms.");
  const resumedData = buildCampaignData(input, developerId, CampaignStatus.DRAFT, platformFeeWaived, ownedDraft.promoRedemptions.length ? ownedDraft.platformFeeDiscountPercent : 0).data;

  return billingTransaction(async (transaction) => {
    if (needsOwnership) resumedData.appUrl = await assertTestFlightOwner(transaction, developerId, input.appUrl, draftId, true);
    await transaction.taskInstruction.deleteMany({ where: { campaignId: draftId } });
    return transaction.appCampaign.update({ where: { id: draftId }, data: resumedData });
  });
}

export async function saveTestCampaignDraft(data: CampaignInput) {
  const input = campaignSchema.parse(data);
  const developer = await requireDeveloper();
  const ownerEmail = process.env.SEEDENV_ANALYTICS_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail || developer.email.trim().toLowerCase() !== ownerEmail || developer.username.trim().toLowerCase() !== "teriberi") {
    throw new Error("Test drafts are only available to the SeedEnv owner account.");
  }

  const campaign = await saveCampaignDraft(developer.id, input, developer.platformFeeWaived);
  return { campaignId: campaign.id, title: campaign.title, status: campaign.status, chargedCents: 0 };
}

async function persistLaunchCampaign(input: CampaignInput, developer: Awaited<ReturnType<typeof requireDeveloper>>, draftId: string | undefined, tax: Awaited<ReturnType<typeof serviceTaxAudit>> | null, expectedPlatformFeeCents?: number) {
  return billingTransaction(async (tx) => {
    const existing = draftId ? await tx.appCampaign.findFirst({
      where: { id: draftId, developerId: developer.id, status: CampaignStatus.DRAFT },
      include: { promoRedemptions: { include: { promoCode: { select: { code: true } } } } },
    }) : null;
    if (draftId && !existing) throw new Error("This saved draft is unavailable or already launched.");
    if (input.promoCode && developer.platformFeeWaived) throw new CohortPromoError("Your account already has a full fee waiver. Remove the promo code before launching.");
    let discountPercent = 0;
    if (existing?.promoRedemptions.length) {
      if (existing.promoRedemptions.some((entry) => entry.consumedAt)) throw new CohortPromoError("This promo code already funded a paid cohort. It cannot be used for another launch.");
      if (existing.promoRedemptions.some((entry) => entry.paymentPending)) throw new CohortPromoError("The previous checkout is still pending. Try again after it has been closed.");
      if ((input.promoCode || "").split(",").sort().join(",") !== existing.promoRedemptions.map((entry) => entry.promoCode.code).sort().join(",")) throw new CohortPromoError("This draft already reserved promo codes. Keep them to resume its agreed funding terms.");
      discountPercent = existing.platformFeeDiscountPercent;
    } else if (input.promoCode) {
      const promos = await Promise.all(input.promoCode.split(",").map((code) => eligibleCohortPromo(tx, developer.id, code)));
      if (promos.filter((entry) => !entry.ownerId).length > 1) throw new CohortPromoError("Only one public promo can be used. Stack it with your own referral credits.");
      discountPercent = promos.reduce((sum, entry) => sum + entry.discountPercent, 0);
      if (discountPercent > 100) throw new CohortPromoError("Discounts cannot exceed 100%. Save the extra credit for another cohort.");
    }
    const custom = !isBundleType(input.cohortType);
    let built = buildCampaignData(input, developer.id, CampaignStatus.ESCROW_PENDING, developer.platformFeeWaived, discountPercent);
    const campaignData = { ...built.data, fundingModel: custom ? CohortFundingModel.PAY_PER_TESTER : CohortFundingModel.PREPAID, ...(tax ? { taxSnapshot: tax } : {}) };
    if (draftId) await tx.taskInstruction.deleteMany({ where: { campaignId: draftId } });
    let campaign = draftId
      ? await tx.appCampaign.update({ where: { id: draftId }, data: campaignData })
      : await tx.appCampaign.create({ data: campaignData });
    if (built.terms.platform === PlatformType.TESTFLIGHT || isTestFlightUrl(input.appUrl)) {
      const appUrl = await assertTestFlightOwner(tx, developer.id, input.appUrl, campaign.id, true);
      campaign = await tx.appCampaign.update({ where: { id: campaign.id }, data: { appUrl } });
    }
    const benefits = await reserveAutomaticFeeBenefits(tx, developer.id, campaign.id, developer.platformFeeWaived || Boolean(existing?.promoRedemptions.length), discountPercent);
    const firstTester = quoteSlotCharge(Math.round(input.bountyPerTaskUsd * 100), 0, 0, developer.platformFeeWaived || benefits.firstCohortFeeWaived, benefits.effectiveDiscountPercent);
    const funded = custom && developer.fundingBalanceCents >= firstTester.totalCents;
    built = buildCampaignData(input, developer.id, funded ? CampaignStatus.ACTIVE : CampaignStatus.ESCROW_PENDING, developer.platformFeeWaived || benefits.firstCohortFeeWaived, benefits.effectiveDiscountPercent);
    const finalQuote = quoteCampaignFunding(built.terms.totalSlots * built.terms.bountyPerTaskUsd, input.cohortType, developer.platformFeeWaived || benefits.firstCohortFeeWaived, benefits.effectiveDiscountPercent);
    if (expectedPlatformFeeCents !== undefined && Math.round(finalQuote.platformFeeUsd * 100) !== expectedPlatformFeeCents) throw new CohortPromoError("Your fee benefits changed in another tab or expired. Refresh Budget and review the new total before launching; no payment was created.");
    campaign = await tx.appCampaign.update({ where: { id: campaign.id }, data: {
      status: funded ? CampaignStatus.ACTIVE : CampaignStatus.ESCROW_PENDING,
      referralPolicyVersion: REFERRAL_RULES.POLICY_VERSION, firstCohortFeeWaived: benefits.firstCohortFeeWaived,
      referralDiscountPercent: benefits.referralDiscountPercent, promoDiscountPercent: discountPercent,
      platformFeeDiscountPercent: benefits.effectiveDiscountPercent, platformFeeUsd: finalQuote.platformFeeUsd, totalBudgetUsd: finalQuote.totalBudgetUsd,
    } });
    // An automatic first-cohort waiver leaves manual codes and legacy vouchers unused.
    if (benefits.firstCohortFeeWaived && input.promoCode && !existing?.promoRedemptions.length) {
      throw new CohortPromoError("Your first cohort already receives a full platform-fee waiver. Remove the promo codes to save them for a later cohort.");
    }
    if (input.promoCode && !existing?.promoRedemptions.length) for (const code of input.promoCode.split(",")) await reserveCohortPromo(tx, developer.id, campaign.id, code);
    if (input.promoCode) await tx.cohortPromoRedemption.updateMany({
      where: { campaignId: campaign.id, consumedAt: null },
      data: { paymentPending: !funded, checkoutSessionId: null },
    });
    let checkoutAttemptId: string | null = null;
    if (!custom) {
      const deposit = await tx.walletTransaction.create({
        data: {
          userId: developer.id,
          amountCents: built.escrowTotalCents,
          campaignId: campaign.id,
          platformFeeCents: Math.round(campaign.platformFeeUsd * 100),
          ...taxLedgerFields(tax),
          invoiceSnapshot: {
            version: 1,
            cohortId: campaign.id,
            cohortTitle: input.title,
            rewardPoolCents: built.escrowTotalCents - Math.round(campaign.platformFeeUsd * 100),
            platformFeeCents: Math.round(campaign.platformFeeUsd * 100),
            company: await billingCompanySnapshot(tx, developer.id),
            ...(tax ? { tax } : {}),
          },
          type: TransactionType.ESCROW_DEPOSIT,
          status: TransactionStatus.PENDING,
          description: `Escrow deposit for ${campaign.title} (${campaign.id})`,
        },
      });
      checkoutAttemptId = deposit.id;
      await tx.appCampaign.update({ where: { id: campaign.id }, data: { fundingCheckoutAttemptId: deposit.id, fundingCheckoutSessionId: null } });
    }
    if (funded) {
      await queueFollowerEmails(tx, developer.id, `cohort:${campaign.id}`, `/cohorts/${campaign.id}`, "A developer you follow launched a new cohort");
    }
    return { campaign, escrowTotalCents: built.escrowTotalCents, terms: built.terms, firstTester, funded, discountPercent: benefits.effectiveDiscountPercent, checkoutAttemptId };
  });
}

export async function createCampaignWithEscrow(data: CampaignInput, draftId?: string, options?: { topUpCents?: number; expectedPlatformFeeCents?: number }) {
  try {
    return await launchCampaignWithEscrow(data, draftId, options);
  } catch (error) {
    if (error instanceof CohortPromoError || error instanceof TestFlightOwnershipError) return { promoError: error.message };
    throw error;
  }
}

async function launchCampaignWithEscrow(data: CampaignInput, draftId?: string, options?: { topUpCents?: number; expectedPlatformFeeCents?: number }) {
  const input = campaignSchema.parse(data);
  const developer = await requireDeveloper();
  const expectedPlatformFeeCents = options?.expectedPlatformFeeCents === undefined ? undefined : z.number().int().min(0).max(100000000).parse(options.expectedPlatformFeeCents);
  if (!process.env.STRIPE_SECRET_KEY) {
    const draft = await saveCampaignDraft(developer.id, input, developer.platformFeeWaived, draftId);
    return { campaignId: draft.id, checkoutUrl: null, escrowTotalCents: 0, requiresPaymentSetup: true };
  }
  const tax = stripeTaxEnabled() ? await prisma.$transaction((tx) => serviceTaxAudit(tx, developer.id)) : null;
  if (input.promoCode) for (const code of input.promoCode.split(",")) await prepareCohortPromoRetry(developer.id, code);

  if (!isBundleType(input.cohortType)) {
    const { campaign: live, funded, firstTester } = await persistLaunchCampaign(input, developer, draftId, tax, expectedPlatformFeeCents);
    revalidatePath("/console");
    if (funded) {
      revalidatePath("/explore");
      return { campaignId: live.id, checkoutUrl: null, escrowTotalCents: 0, launched: true };
    }
    // Not enough balance for the first tester: the cohort goes live as soon as this top-up is paid.
    const requested = Number.isSafeInteger(options?.topUpCents) ? Number(options?.topUpCents) : 0;
    const creditCents = Math.min(MAX_TOP_UP_CENTS, Math.max(requested, topUpForShortfall(firstTester.totalCents - developer.fundingBalanceCents)));
    try {
      const checkout = await createTopUpCheckout(developer, creditCents, {
        campaignId: live.id,
        successPath: `/console?view=overview&launched=${live.id}`,
        cancelPath: `/console?view=billing&topup=cancelled&campaign=${live.id}`,
      });
      if (input.promoCode) await recordCohortPromoCheckout(live.id, checkout.sessionId);
      return { campaignId: live.id, checkoutUrl: checkout.url, escrowTotalCents: checkout.quote.totalCents };
    } catch (error) {
      // Once Stripe has returned a session, retain the payment lock until it is closed.
      const pending = await prisma.balanceTopUp.findFirst({ where: { campaignId: live.id, status: "PENDING" } });
      if (pending || !(error instanceof Stripe.errors.StripeInvalidRequestError)) {
        console.error("SeedEnv top-up checkout outcome requires reconciliation:", live.id, error);
        throw new CohortPromoError("Stripe checkout could not be confirmed. Your fee benefits remain reserved; contact support before starting another payment.");
      }
      if (input.promoCode) await failedCohortPromoCheckout(live.id);
      await prisma.appCampaign.updateMany({ where: { id: live.id, status: CampaignStatus.ESCROW_PENDING }, data: { status: CampaignStatus.DRAFT } });
      await billingTransaction(tx => releaseUnfundedFeeBenefits(tx, live.id));
      throw error;
    }
  }

  if (process.env.STRIPE_SECRET_KEY) {
    let hasSavedPaymentMethod = false;
    if (developer.stripeCustomerId) {
      try {
        const customer = await getStripe().customers.retrieve(developer.stripeCustomerId);
        hasSavedPaymentMethod = !customer.deleted && Boolean(customer.invoice_settings.default_payment_method);
      } catch {
        hasSavedPaymentMethod = false;
      }
    }
    if (!hasSavedPaymentMethod) {
      const draft = await saveCampaignDraft(developer.id, input, developer.platformFeeWaived, draftId);
      return { campaignId: draft.id, checkoutUrl: null, escrowTotalCents: 0, requiresPaymentSetup: true };
    }
  }

  const { campaign, escrowTotalCents, terms, discountPercent, checkoutAttemptId } = await persistLaunchCampaign(input, developer, draftId, tax, expectedPlatformFeeCents);

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      customer: stripeTaxEnabled() ? await ensureStripeCustomer(developer) : developer.stripeCustomerId || undefined,
      ...storedValueCheckoutTax(),
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(terms.totalSlots * terms.bountyPerTaskUsd * 100),
            tax_behavior: "exclusive",
            product_data: {
              tax_code: QA_SERVICE_TAX_CODE,
              name: `Tester bounty escrow: ${campaign.title}`,
              description: `${terms.totalSlots} tester slots at $${terms.bountyPerTaskUsd.toFixed(2)}. Reserved entirely for tester compensation.`,
            },
          },
        },
        ...(campaign.platformFeeUsd > 0 ? [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(campaign.platformFeeUsd * 100),
            tax_behavior: "exclusive" as const,
            product_data: {
              tax_code: QA_SERVICE_TAX_CODE,
              name: `SeedEnv platform servicing: ${campaign.title}`,
              description: checkoutDescription(input, terms, developer.platformFeeWaived || campaign.firstCohortFeeWaived, discountPercent),
            },
          },
        }] : []),
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://seedenv.com"}/console?view=billing&escrow=success&campaign=${campaign.id}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://seedenv.com"}/console?view=billing&escrow=cancelled&campaign=${campaign.id}`,
      metadata: {
        ...seedenvTaxMetadata(),
        seedenvServiceTax: tax ? "1" : "0",
        type: "SEEDENV_CAMPAIGN_ESCROW",
        campaignId: campaign.id,
        developerId: developer.id,
        cohortType: input.cohortType,
        checkoutAttemptId: checkoutAttemptId!,
      },
    }, { idempotencyKey: `seedenv-campaign-${checkoutAttemptId}` });
  } catch (error) {
    if (!(error instanceof Stripe.errors.StripeInvalidRequestError)) {
      console.error("SeedEnv bundle checkout outcome requires reconciliation:", campaign.id, error);
      throw new CohortPromoError("Stripe checkout could not be confirmed. Your fee benefits remain reserved; contact support before starting another payment.");
    }
    await prisma.$transaction([
      prisma.appCampaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.PAUSED } }),
      prisma.walletTransaction.updateMany({ where: { description: { contains: `(${campaign.id})` }, status: TransactionStatus.PENDING }, data: { status: TransactionStatus.FAILED } }),
    ]);
    if (input.promoCode) await failedCohortPromoCheckout(campaign.id);
    await billingTransaction(tx => releaseUnfundedFeeBenefits(tx, campaign.id));
    throw error;
  }
  await prisma.appCampaign.update({ where: { id: campaign.id }, data: { fundingCheckoutSessionId: session.id } });
  if (!session.url) throw new Error("Stripe did not return a checkout link. Your fee benefits remain reserved until payment reconciliation.");
  if (input.promoCode) await recordCohortPromoCheckout(campaign.id, session.id);

  return { campaignId: campaign.id, checkoutUrl: session.url, escrowTotalCents };
}

export async function endCohort(campaignId: string) {
  const developer = await requireDeveloper();
  const id = z.string().min(1).max(200).parse(campaignId);
  try {
    const result = await cancelCohort(developer.id, id, developer.role === "ADMIN");
    revalidatePath("/console");
    revalidatePath("/explore");
    revalidatePath("/applications");
    const funding = await prisma.appCampaign.findUnique({ where: { id }, select: { fundingModel: true } });
    const toBalance = funding?.fundingModel === CohortFundingModel.PAY_PER_TESTER;
    const parts = [result.refundedCents ? `${formatCents(result.refundedCents)} ${toBalance ? "returned to your prepaid balance" : "refunded to your card"}` : toBalance ? "No unused paid places to return" : "No unused escrow to refund"];
    if (result.inProgress) parts.push(`${result.inProgress} tester${result.inProgress === 1 ? " is" : "s are"} already working and will still be reviewed and paid; anything they don't use is returned automatically`);
    return { ok: true as const, message: `Cohort ended. ${parts.join(". ")}.` };
  } catch (error) {
    return { ok: false as const, message: error instanceof Error ? error.message : "The cohort could not be ended." };
  }
}
