"use server";

import { CampaignStatus, PlatformType, TaskProofType, TransactionStatus, TransactionType } from "@prisma/client";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SEEDENV_PLATFORM_FEE_PERCENT, getStripe } from "@/lib/stripe";
import { usdToCents } from "@/lib/utils";

const taskInstructionSchema = z.object({
  instructionTitle: z.string().min(3).max(90),
  instructionDetail: z.string().min(12).max(900),
  proofType: z.nativeEnum(TaskProofType),
});

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
});

export type CampaignInput = z.infer<typeof campaignSchema>;

function buildCampaignData(input: CampaignInput, developerId: string, status: CampaignStatus) {
  const testerPayoutPoolUsd = input.totalSlots * input.bountyPerTaskUsd;
  const totalBudgetUsd = Number((testerPayoutPoolUsd / (1 - SEEDENV_PLATFORM_FEE_PERCENT)).toFixed(2));
  const platformFeeUsd = Number((totalBudgetUsd - testerPayoutPoolUsd).toFixed(2));
  const escrowTotalCents = usdToCents(totalBudgetUsd);

  return {
    escrowTotalCents,
    data: {
      developerId,
      title: input.title,
      platform: input.platform,
      appUrl: input.appUrl,
      iconUrl: input.iconUrl || null,
      targetVibe: input.targetVibe,
      description: input.description,
      totalBudgetUsd,
      bountyPerTaskUsd: input.bountyPerTaskUsd,
      platformFeeUsd,
      totalSlots: input.totalSlots,
      status,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      instructions: {
        create: input.instructions.map((instruction, index) => ({
          ...instruction,
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
    throw new Error("No-charge test drafts are only available to the SeedEnv owner account.");
  }

  const { data: campaignData } = buildCampaignData(input, developer.id, CampaignStatus.DRAFT);
  const campaign = await prisma.appCampaign.create({ data: campaignData });
  return { campaignId: campaign.id, title: campaign.title, status: campaign.status, chargedCents: 0 };
}

export async function createCampaignWithEscrow(data: CampaignInput, draftId?: string) {
  const input = campaignSchema.parse(data);
  const developer = await requireDeveloper();
  if (process.env.NODE_ENV === "production" && !process.env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is required in production. No campaign or escrow record was created.");
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

  const { data: campaignData, escrowTotalCents } = buildCampaignData(input, developer.id, CampaignStatus.ESCROW_PENDING);
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
      type: TransactionType.ESCROW_DEPOSIT,
      status: TransactionStatus.PENDING,
      description: `Escrow deposit for ${campaign.title} (${campaign.id})`,
    },
  });

  if (!process.env.STRIPE_SECRET_KEY) {
    return { campaignId: campaign.id, checkoutUrl: null, escrowTotalCents };
  }

  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: developer.stripeCustomerId || undefined,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: escrowTotalCents,
            product_data: {
              name: `SeedEnv escrow: ${campaign.title}`,
              description: `${input.totalSlots} tester slots at $${input.bountyPerTaskUsd.toFixed(2)} plus 8% platform and telemetry fee`,
            },
          },
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://seedenv.com"}/console?view=billing&escrow=success&campaign=${campaign.id}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://seedenv.com"}/console?view=billing&escrow=cancelled&campaign=${campaign.id}`,
      metadata: {
        type: "SEEDENV_CAMPAIGN_ESCROW",
        campaignId: campaign.id,
        developerId: developer.id,
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

export async function handleStripeWebhook(event: { type: string; data: { object: { id?: string; payment_intent?: string; setup_intent?: string | { id: string } | null; customer?: string | { id: string } | null; metadata?: Record<string, string> } } }) {
  if (event.type !== "checkout.session.completed" && event.type !== "payment_intent.succeeded") return { ignored: true };

  const object = event.data.object;
  const metadata = object.metadata || {};
  if (event.type === "checkout.session.completed" && metadata.type === "SEEDENV_PAYMENT_METHOD_SETUP") {
    const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
    const setupIntentId = typeof object.setup_intent === "string" ? object.setup_intent : object.setup_intent?.id;
    const userId = metadata.seedenvUserId;
    if (!customerId || !setupIntentId || !userId) return { ignored: true };

    const user = await prisma.user.findFirst({ where: { id: userId, stripeCustomerId: customerId }, select: { id: true } });
    if (!user) return { ignored: true };
    const setupIntent = await getStripe().setupIntents.retrieve(setupIntentId);
    const paymentMethodId = typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method?.id;
    if (!paymentMethodId) return { ignored: true };
    await getStripe().customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
    return { paymentMethodSaved: true, userId };
  }

  if (metadata.type !== "SEEDENV_CAMPAIGN_ESCROW" || !metadata.campaignId) return { ignored: true };

  const stripePaymentId = object.payment_intent || object.id || null;
  await prisma.$transaction(async (tx) => {
    const campaign = await tx.appCampaign.findUnique({ where: { id: metadata.campaignId }, select: { status: true } });
    if (!campaign || campaign.status === CampaignStatus.ACTIVE) return;
    await tx.appCampaign.update({
      where: { id: metadata.campaignId },
      data: { status: CampaignStatus.ACTIVE },
    });
    await tx.walletTransaction.updateMany({
      where: {
        description: { contains: metadata.campaignId },
        status: TransactionStatus.PENDING,
      },
      data: { status: TransactionStatus.COMPLETED, stripePaymentId },
    });
  });

  return { activated: true, campaignId: metadata.campaignId };
}
