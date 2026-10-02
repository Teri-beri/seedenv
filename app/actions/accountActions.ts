"use server";

import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { Prisma, UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { Resend } from "resend";
import { isDiscordWebhookUrl, sendDiscordWebhookMessage } from "@/lib/discord";
import { hashPassword, validatePassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

const accountSettingsSchema = z.object({
  name: z.string().trim().max(80).optional(),
  username: z.string().trim().min(3, "Username must be at least 3 characters.").max(32, "Username must be 32 characters or fewer.").regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers, and underscores."),
  avatarUrl: z.string().trim().url().optional().or(z.literal("")),
  bio: z.string().trim().max(200, "Bio must be 200 characters or fewer.").optional(),
  portfolioUrl: z.string().trim().url().optional().or(z.literal("")),
  companyName: z.string().trim().max(100).optional(),
  productUrl: z.string().trim().url().optional().or(z.literal("")),
  githubUsername: z.string().trim().max(39).regex(/^$|^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/, "Enter a valid GitHub username.").optional(),
  discordUrl: z.string().trim().url().refine((value) => new URL(value).protocol === "https:", "Discord URL must use HTTPS.").optional().or(z.literal("")),
  twitterHandle: z.string().trim().max(16).regex(/^$|^@?[A-Za-z0-9_]{1,15}$/, "Enter a valid X/Twitter handle.").transform((value) => value.replace(/^@/, "")).optional(),
});

const notificationPreferencesSchema = z.object({
  email_tester_feedback: z.boolean(),
  email_ledger_updates: z.boolean(),
  email_announcements: z.boolean(),
}).strict();

const discordWebhookUrlSchema = z.string().trim().url().refine(isDiscordWebhookUrl, "Enter a valid HTTPS Discord webhook URL.").optional().or(z.literal(""));

export type AccountSettingsInput = z.infer<typeof accountSettingsSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export type SettingsActionResult = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> };
export type WorkspaceRole = typeof UserRole.TESTER | typeof UserRole.DEVELOPER;
export type StripeRedirectResult = { ok: true; url: string } | { ok: false; message: string };

const stripeConnectCountries = ["US", "CA", "GB", "AU", "NZ", "IE", "DE", "FR", "NL", "ES", "IT", "SG"] as const;

function stripeAppUrl(path: string) {
  return new URL(path, process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://seedenv.com").toString();
}

export async function createStripeConnectOnboardingLink(country: string): Promise<StripeRedirectResult> {
  const user = await getCurrentUser();
  if (user.role !== UserRole.TESTER && user.role !== UserRole.DEVELOPER) return { ok: false, message: "A Tester or Developer workspace is required." };
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, message: "Stripe setup is unavailable. Contact SeedEnv support." };
  const parsedCountry = z.enum(stripeConnectCountries).safeParse(country);
  if (!parsedCountry.success) return { ok: false, message: "Choose a supported country." };

  try {
    const stripe = getStripe();
    let connectedAccountId = user.stripeConnectAccountId;
    if (connectedAccountId) {
      const existingAccount = await stripe.accounts.retrieve(connectedAccountId);
      if (existingAccount.country !== parsedCountry.data) {
        return { ok: false, message: "A Stripe account is already linked. Contact support to change its country." };
      }
    } else {
      const account = await stripe.accounts.create({
        type: "express",
        country: parsedCountry.data,
        email: user.email,
        capabilities: { transfers: { requested: true } },
        metadata: { seedenvUserId: user.id },
      }, { idempotencyKey: `seedenv-connect-${user.id}` });
      connectedAccountId = account.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeConnectAccountId: connectedAccountId } });
    }

    const link = await stripe.accountLinks.create({
      account: connectedAccountId,
      refresh_url: stripeAppUrl("/account?tab=portfolio&stripeConnect=refresh"),
      return_url: stripeAppUrl("/account?tab=portfolio&stripeConnect=return"),
      type: "account_onboarding",
    });
    return { ok: true, url: link.url };
  } catch (error) {
    console.error("SeedEnv Stripe Connect onboarding failed:", error);
    return { ok: false, message: "Stripe could not start payout setup. Check your Stripe Connect account and try again." };
  }
}

export async function createStripePaymentMethodSetupLink(draftId?: string): Promise<StripeRedirectResult> {
  const user = await getCurrentUser("DEVELOPER");
  if (user.role !== UserRole.DEVELOPER) return { ok: false, message: "Switch to your Developer workspace to set up campaign funding." };
  if (!process.env.STRIPE_SECRET_KEY) return { ok: false, message: "Stripe setup is unavailable. Contact SeedEnv support." };
  if (draftId) {
    const draft = await prisma.appCampaign.findFirst({ where: { id: draftId, developerId: user.id, status: "DRAFT" }, select: { id: true } });
    if (!draft) return { ok: false, message: "That draft is unavailable for payment setup." };
  }

  try {
    const stripe = getStripe();
    let customerId = user.stripeCustomerId;
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) customerId = null;
      } catch (error) {
        const stripeCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
        if (stripeCode === "resource_missing") customerId = null;
        else throw error;
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || user.username,
        metadata: { seedenvUserId: user.id },
      }, { idempotencyKey: `seedenv-customer-${user.id}` });
      customerId = customer.id;
      await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
    }

    const draftQuery = draftId ? `&draft=${encodeURIComponent(draftId)}` : "";
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      setup_intent_data: { metadata: { seedenvUserId: user.id } },
      success_url: stripeAppUrl(`/account?tab=portfolio&stripePayment=success${draftQuery}`),
      cancel_url: stripeAppUrl(`/account?tab=portfolio&stripePayment=cancelled${draftQuery}`),
      metadata: { type: "SEEDENV_PAYMENT_METHOD_SETUP", seedenvUserId: user.id },
    });
    if (!session.url) return { ok: false, message: "Stripe did not return a setup link. Please try again." };
    return { ok: true, url: session.url };
  } catch (error) {
    console.error("SeedEnv Stripe payment setup failed:", error);
    return { ok: false, message: "Stripe could not start payment-method setup. Please try again." };
  }
}

export async function activateAccountWorkspace(role: WorkspaceRole): Promise<SettingsActionResult> {
  const user = await getCurrentUser();
  const parsedRole = z.enum([UserRole.TESTER, UserRole.DEVELOPER]).safeParse(role);
  if (!parsedRole.success) return { ok: false, message: "Choose a valid SeedEnv workspace." };
  if (user.role === UserRole.ADMIN) return { ok: false, message: "Admin accounts cannot switch to member workspaces." };

  await prisma.user.update({
    where: { id: user.id },
    data: parsedRole.data === UserRole.TESTER
      ? { role: UserRole.TESTER, testerWorkspaceEnabled: true }
      : { role: UserRole.DEVELOPER, developerWorkspaceEnabled: true },
  });
  return { ok: true };
}

export async function updateAccountSettings(data: AccountSettingsInput): Promise<SettingsActionResult> {
  const user = await getCurrentUser();
  const parsed = accountSettingsSchema.safeParse(data);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
    return { ok: false, message: "Check the highlighted profile fields.", fieldErrors };
  }
  const input = parsed.data;

  const usernameTaken = await prisma.user.findFirst({
    where: { username: { equals: input.username, mode: "insensitive" }, id: { not: user.id } },
    select: { id: true },
  });
  if (usernameTaken) return { ok: false, message: "That username is already taken.", fieldErrors: { username: "That username is already taken." } };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: input.name || null,
      username: input.username,
      avatarUrl: input.avatarUrl || null,
      image: input.avatarUrl || null,
      bio: input.bio || null,
      portfolioUrl: input.portfolioUrl || null,
      companyName: input.companyName || null,
      productUrl: input.productUrl || null,
      githubUsername: input.githubUsername || null,
      discordUrl: input.discordUrl || null,
      twitterHandle: input.twitterHandle || null,
    },
  });
  return { ok: true };
}

export async function saveNotificationSettings(data: { notificationPreferences: NotificationPreferences; discordWebhookUrl: string }): Promise<SettingsActionResult> {
  const user = await getCurrentUser();
  const parsed = z.object({
    notificationPreferences: notificationPreferencesSchema,
    discordWebhookUrl: discordWebhookUrlSchema,
  }).safeParse(data);
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]));
    return { ok: false, message: "Check the highlighted notification settings.", fieldErrors };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      notificationPreferences: parsed.data.notificationPreferences as Prisma.InputJsonValue,
      discordWebhookUrl: parsed.data.discordWebhookUrl || null,
    },
  });
  return { ok: true };
}

export async function testDiscordWebhook(webhookUrl: string): Promise<SettingsActionResult> {
  await getCurrentUser();
  const parsed = discordWebhookUrlSchema.safeParse(webhookUrl);
  if (!parsed.success || !parsed.data) {
    return { ok: false, message: parsed.error?.issues[0]?.message || "Enter a valid Discord webhook URL." };
  }

  try {
    const response = await sendDiscordWebhookMessage(parsed.data, "SeedEnv test: developer feedback alerts are connected.");
    if (!response.ok) return { ok: false, message: `Discord rejected the test message (HTTP ${response.status}).` };
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not reach that Discord webhook. Check the URL and try again." };
  }
}

export type ActionResult = { ok: true } | { ok: false; message: string };

export async function setAccountPassword(data: { password: string; confirmPassword: string }): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (user.passwordHash) return { ok: false, message: "Password changes require email verification. Request a verification link from Account Security." };
  if (data.password !== data.confirmPassword) return { ok: false, message: "Passwords do not match." };

  const problem = validatePassword(data.password);
  if (problem) return { ok: false, message: problem };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(data.password) } });
  return { ok: true };
}

function passwordChangeIdentifier(userId: string) {
  return `password-change:${userId}`;
}

function hashVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordChangeVerification(): Promise<ActionResult> {
  const user = await getCurrentUser();
  const resendApiKey = process.env.RESEND_API_KEY?.trim().replace(/^['"]|['"]$/g, "");
  const origin = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!resendApiKey || !origin) return { ok: false, message: "Email verification is unavailable right now. Please try again later." };

  const rawToken = randomBytes(32).toString("base64url");
  const identifier = passwordChangeIdentifier(user.id);
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token: hashVerificationToken(rawToken), expires: new Date(Date.now() + 15 * 60 * 1000) },
  });

  const link = new URL(`/account/password/verify?token=${encodeURIComponent(rawToken)}`, origin).toString();
  const from = process.env.AUTH_EMAIL_FROM?.trim() || "SeedEnv Authentication <auth@seedenv.com>";
  try {
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from,
      to: user.email,
      subject: "Verify your SeedEnv password change",
      text: `Use this link to verify your password change. It expires in 15 minutes and can only be used once:\n${link}\n\nIf you did not request this, ignore this email. Your password will not change.`,
      html: `<p>Use this link to verify your SeedEnv password change. It expires in 15 minutes and can only be used once.</p><p><a href="${link}">Verify and change password</a></p><p>If you did not request this, ignore this email. Your password will not change.</p>`,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (error) {
    await prisma.verificationToken.deleteMany({ where: { identifier, token: hashVerificationToken(rawToken) } });
    console.error("SeedEnv password verification email failed:", error);
    return { ok: false, message: "We could not send the verification email. Please try again." };
  }
}

export async function changePasswordAfterEmailVerification(data: { token: string; password: string; confirmPassword: string }): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (data.password !== data.confirmPassword) return { ok: false, message: "Passwords do not match." };
  const problem = validatePassword(data.password);
  if (problem) return { ok: false, message: problem };

  const identifier = passwordChangeIdentifier(user.id);
  const hashedToken = hashVerificationToken(data.token);
  const passwordHash = await hashPassword(data.password);
  const changed = await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.verificationToken.deleteMany({
      where: { identifier, token: hashedToken, expires: { gt: new Date() } },
    });
    if (consumed.count !== 1) return false;
    await transaction.user.update({ where: { id: user.id }, data: { passwordHash } });
    return true;
  });

  return changed
    ? { ok: true }
    : { ok: false, message: "This verification link is invalid or expired. Request a new one from Account Security." };
}

const onboardingUsernameSchema = z.string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username must be 32 characters or fewer.")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers, and underscores.");

export async function saveOnboardingProfile(data: AccountSettingsInput): Promise<ActionResult> {
  const user = await getCurrentUser();
  const parsed = accountSettingsSchema.extend({ username: onboardingUsernameSchema }).safeParse(data);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "Check your profile details." };

  const input = parsed.data;
  if (user.role === "DEVELOPER" && !input.companyName) return { ok: false, message: "Company or studio name is required." };

  const usernameTaken = await prisma.user.findFirst({
    where: { username: { equals: input.username, mode: "insensitive" }, id: { not: user.id } },
    select: { id: true },
  });
  if (usernameTaken) return { ok: false, message: "That username is already taken." };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: input.name || null,
      username: input.username,
      bio: input.bio || null,
      portfolioUrl: input.portfolioUrl || null,
      companyName: user.role === "DEVELOPER" ? input.companyName || null : null,
      productUrl: user.role === "DEVELOPER" ? input.productUrl || null : null,
    },
  });
  return { ok: true };
}
