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

const campaignSchema = z.object({
  title: z.string().min(4).max(90),
  platform: z.nativeEnum(PlatformType),
  appUrl: z.string().url(),
  iconUrl: z.string().url().optional().or(z.literal("")),
  targetVibe: z.string().min(3).max(80),
  description: z.string().min(24).max(1400),
  totalSlots: z.number().int().min(5).max(500),
  bountyPerTaskUsd: z.number().min(1).max(100),
  instructions: z.array(taskInstructionSchema).min(1).max(12),
});

export type CampaignInput = z.infer<typeof campaignSchema>;

export async function createCampaignWithEscrow(data: CampaignInput) {
  const input = campaignSchema.parse(data);
  const developer = await getCurrentUser("DEVELOPER");
  if (developer.role !== "DEVELOPER" && developer.role !== "ADMIN") {
    throw new Error("Only developers can launch SeedEnv drops.");
  }

  const totalBudgetUsd = Number((input.totalSlots * input.bountyPerTaskUsd).toFixed(2));
  const platformFeeUsd = Number((totalBudgetUsd * SEEDENV_PLATFORM_FEE_PERCENT).toFixed(2));
  const escrowTotalCents = usdToCents(totalBudgetUsd + platformFeeUsd);

  const campaign = await prisma.appCampaign.create({
    data: {
      developerId: developer.id,
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
      status: CampaignStatus.ESCROW_PENDING,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      instructions: {
        create: input.instructions.map((instruction, index) => ({
          ...instruction,
          stepNumber: index + 1,
        })),
      },
    },
  });

  await prisma.walletTransaction.create({
    data: {
      userId: developer.id,
      amountCents: escrowTotalCents,
      type: TransactionType.ESCROW_DEPOSIT,
      status: TransactionStatus.PENDING,
      description: `Escrow deposit for ${campaign.title}`,
    },
  });

  if (!process.env.STRIPE_SECRET_KEY) {
    if (process.env.NODE_ENV === "production") throw new Error("Stripe is required in production.");
    return { campaignId: campaign.id, checkoutUrl: `/developer?previewEscrow=${campaign.id}`, escrowTotalCents };
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: escrowTotalCents,
          product_data: {
            name: `SeedEnv escrow: ${campaign.title}`,
            description: `${input.totalSlots} tester slots at $${input.bountyPerTaskUsd.toFixed(2)} plus 20% platform fee`,
          },
        },
      },
    ],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://seedenv.com"}/developer?escrow=success&campaign=${campaign.id}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "https://seedenv.com"}/developer?escrow=cancelled&campaign=${campaign.id}`,
    metadata: {
      type: "SEEDENV_CAMPAIGN_ESCROW",
      campaignId: campaign.id,
      developerId: developer.id,
    },
  });

  return { campaignId: campaign.id, checkoutUrl: session.url, escrowTotalCents };
}

export async function handleStripeWebhook(event: { type: string; data: { object: { id?: string; payment_intent?: string; metadata?: Record<string, string> } } }) {
  if (event.type !== "checkout.session.completed" && event.type !== "payment_intent.succeeded") return { ignored: true };

  const object = event.data.object;
  const metadata = object.metadata || {};
  if (metadata.type !== "SEEDENV_CAMPAIGN_ESCROW" || !metadata.campaignId) return { ignored: true };

  const stripePaymentId = object.payment_intent || object.id || null;
  await prisma.$transaction(async (tx) => {
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
