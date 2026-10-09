"use server";

import { CampaignStatus, CohortFundingModel, CohortType, PlatformType, TaskProofType, TransactionStatus, TransactionType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { COHORT_BUNDLES, COHORT_MIN_PLATFORM_FEE_CENTS, COHORT_PLATFORM_FEE_RATE, isBundleType, MAX_TOP_UP_CENTS, quoteCampaignFunding, quoteSlotCharge, topUpForShortfall } from "@/lib/pricing";
import { createTopUpCheckout } from "@/lib/funding-balance";
import { resolveTaskMinimumRep, SEED_TASK_PRESETS } from "@/lib/micro-task-templates";
import { billingDetailsSchema } from "@/lib/enterprise-rules";
import { cancelCohort } from "@/lib/slot-funding";
import { formatCents } from "@/lib/utils";
import { serviceTaxAudit, taxLedgerFields, QA_SERVICE_TAX_CODE, stripeTaxEnabled } from "@/lib/billing/tax-policy";
import { seedenvTaxMetadata, storedValueCheckoutTax } from "@/lib/stripe/billing";
import { ensureStripeCustomer } from "@/lib/stripe-customer";

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

function checkoutDescription(input: CampaignInput, terms: ReturnType<typeof resolveCohortTerms>) {
  if (isBundleType(input.cohortType)) {
    const bundle = COHORT_BUNDLES[input.cohortType];
    return `${bundle.name}: ${terms.totalSlots} tester slots at $${terms.bountyPerTaskUsd.toFixed(2)} plus a flat $${(bundle.platformFeeCents / 100).toFixed(2)} platform fee`;
  }
  return `${terms.totalSlots} tester slots at $${terms.bountyPerTaskUsd.toFixed(2)} plus a ${COHORT_PLATFORM_FEE_RATE * 100}% platform fee on the tester reward pool (minimum $${(COHORT_MIN_PLATFORM_FEE_CENTS / 100).toFixed(2)})`;
}

function buildCampaignData(input: CampaignInput, developerId: string, status: CampaignStatus) {
  const terms = resolveCohortTerms(input);
  const testerPayoutPoolUsd = terms.totalSlots * terms.bountyPerTaskUsd;
  const { totalBudgetUsd, platformFeeUsd, escrowTotalCents } = quoteCampaignFunding(testerPayoutPoolUsd, input.cohortType);

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

async function saveCampaignDraft(developerId: string, input: CampaignInput, draftId?: string) {
  const { data: draftData } = buildCampaignData(input, developerId, CampaignStatus.DRAFT);
  if (!draftId) return prisma.appCampaign.create({ data: draftData });

  const ownedDraft = await prisma.appCampaign.findFirst({
    where: { id: draftId, developerId, status: CampaignStatus.DRAFT },
    select: { id: true },
  });
  if (!ownedDraft) throw new Error("This saved draft is unavailable or already launched.");

  return prisma.$transaction(async (transaction) => {
    await transaction.taskInstruction.deleteMany({ where: { campaignId: draftId } });
    return transaction.appCampaign.update({ where: { id: draftId }, data: draftData });
  });
}

export async function saveTestCampaignDraft(data: CampaignInput) {
  const input = campaignSchema.parse(data);
  const developer = await requireDeveloper();
  const ownerEmail = process.env.SEEDENV_ANALYTICS_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail || developer.email.trim().toLowerCase() !== ownerEmail || developer.username.trim().toLowerCase() !== "teriberi") {
    throw new Error("Test drafts are only available to the SeedEnv owner account.");
  }

  const { data: campaignData } = buildCampaignData(input, developer.id, CampaignStatus.DRAFT);
  const campaign = await prisma.appCampaign.create({ data: campaignData });
  return { campaignId: campaign.id, title: campaign.title, status: campaign.status, chargedCents: 0 };
}

export async function createCampaignWithEscrow(data: CampaignInput, draftId?: string, options?: { topUpCents?: number }) {
  const input = campaignSchema.parse(data);
  const developer = await requireDeveloper();
  if (!process.env.STRIPE_SECRET_KEY) {
    const draft = await saveCampaignDraft(developer.id, input, draftId);
    return { campaignId: draft.id, checkoutUrl: null, escrowTotalCents: 0, requiresPaymentSetup: true };
  }
  const tax = stripeTaxEnabled() ? await prisma.$transaction((tx) => serviceTaxAudit(tx, developer.id)) : null;

  if (!isBundleType(input.cohortType)) {
    const firstTester = quoteSlotCharge(Math.round(input.bountyPerTaskUsd * 100), 0, 0);
    const funded = developer.fundingBalanceCents >= firstTester.totalCents;
    const { data: liveData } = buildCampaignData(input, developer.id, funded ? CampaignStatus.ACTIVE : CampaignStatus.ESCROW_PENDING);
    const payPerTester = { ...liveData, fundingModel: CohortFundingModel.PAY_PER_TESTER, ...(tax ? { taxSnapshot: tax } : {}) };
    let live;
    if (draftId) {
      const ownedDraft = await prisma.appCampaign.findFirst({ where: { id: draftId, developerId: developer.id, status: CampaignStatus.DRAFT }, select: { id: true } });
      if (!ownedDraft) throw new Error("This saved draft is unavailable or already launched.");
      live = await prisma.$transaction(async (transaction) => {
        await transaction.taskInstruction.deleteMany({ where: { campaignId: draftId } });
        return transaction.appCampaign.update({ where: { id: draftId }, data: payPerTester });
      });
    } else {
      live = await prisma.appCampaign.create({ data: payPerTester });
    }
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
      return { campaignId: live.id, checkoutUrl: checkout.url, escrowTotalCents: checkout.quote.totalCents };
    } catch (error) {
      await prisma.appCampaign.updateMany({ where: { id: live.id, status: CampaignStatus.ESCROW_PENDING }, data: { status: CampaignStatus.DRAFT } });
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
      const draft = await saveCampaignDraft(developer.id, input, draftId);
      return { campaignId: draft.id, checkoutUrl: null, escrowTotalCents: 0, requiresPaymentSetup: true };
    }
  }

  const profile = await prisma.billingProfile.findUnique({ where: { userId: developer.id } });
  const company = profile ? billingDetailsSchema.parse({ ...profile, taxId: profile.taxId || "", billingEmail: profile.billingEmail || "", addressLine2: profile.addressLine2 || "", region: profile.region || "" }) : null;
  const { data: baseCampaignData, escrowTotalCents, terms } = buildCampaignData(input, developer.id, CampaignStatus.ESCROW_PENDING);
  const campaignData = { ...baseCampaignData, ...(tax ? { taxSnapshot: tax } : {}) };
  let campaign;
  if (draftId) {
    const ownedDraft = await prisma.appCampaign.findFirst({
      where: { id: draftId, developerId: developer.id, status: CampaignStatus.DRAFT },
      select: { id: true },
    });
    if (!ownedDraft) throw new Error("This saved draft is unavailable or already launched.");
    campaign = await prisma.$transaction(async (transaction) => {
      await transaction.taskInstruction.deleteMany({ where: { campaignId: draftId } });
      return transaction.appCampaign.update({ where: { id: draftId }, data: campaignData });
    });
  } else {
    campaign = await prisma.appCampaign.create({ data: campaignData });
  }

  await prisma.walletTransaction.create({
    data: {
      userId: developer.id,
      amountCents: escrowTotalCents,
      campaignId: campaign.id,
      platformFeeCents: Math.round(campaignData.platformFeeUsd * 100),
      ...taxLedgerFields(tax),
      invoiceSnapshot: {
        version: 1,
        cohortId: campaign.id,
        cohortTitle: input.title,
        rewardPoolCents: escrowTotalCents - Math.round(campaignData.platformFeeUsd * 100),
        platformFeeCents: Math.round(campaignData.platformFeeUsd * 100),
        company,
        ...(tax ? { tax } : {}),
      },
      type: TransactionType.ESCROW_DEPOSIT,
      status: TransactionStatus.PENDING,
      description: `Escrow deposit for ${campaign.title} (${campaign.id})`,
    },
  });

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeTaxEnabled() ? await ensureStripeCustomer(developer) : developer.stripeCustomerId || undefined,
      ...storedValueCheckoutTax(),
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: escrowTotalCents,
            tax_behavior: "exclusive",
            product_data: {
              tax_code: QA_SERVICE_TAX_CODE,
              name: `SeedEnv escrow: ${campaign.title}`,
              description: checkoutDescription(input, terms),
            },
          },
        },
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
      },
    });
  } catch (error) {
    await prisma.$transaction([
      prisma.appCampaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.PAUSED } }),
      prisma.walletTransaction.updateMany({ where: { description: { contains: `(${campaign.id})` }, status: TransactionStatus.PENDING }, data: { status: TransactionStatus.FAILED } }),
    ]);
    throw error;
  }

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
