import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const usernameSchema = z.string()
  .trim()
  .min(3, "Username must be at least 3 characters.")
  .max(32, "Username must be 32 characters or fewer.")
  .regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers, and underscores.");

const signupProfileSchema = z.object({
  role: z.enum([UserRole.TESTER, UserRole.DEVELOPER]),
  email: z.string().trim().email("Enter a valid email address."),
  name: z.string().trim().min(2, "Display name is required.").max(80),
  username: usernameSchema,
  bio: z.string().trim().min(10, "Tell us a little more before joining.").max(240),
  portfolioUrl: z.string().trim().url("Enter a valid URL.").optional().or(z.literal("")),
  companyName: z.string().trim().optional(),
  productUrl: z.string().trim().url("Enter a valid product URL.").optional().or(z.literal("")),
});

function encode(value: string) {
  return encodeURIComponent(value.trim());
}

export async function POST(request: NextRequest) {
  try {
    const input = signupProfileSchema.parse(await request.json());

    if (input.role === UserRole.DEVELOPER && !input.companyName?.trim()) {
      return NextResponse.json({ message: "Company or studio name is required for developer accounts." }, { status: 400 });
    }

    const existingUsername = await prisma.user.findFirst({
      where: {
        username: { equals: input.username, mode: "insensitive" },
        email: { not: input.email },
      },
      select: { id: true },
    });
    if (existingUsername) return NextResponse.json({ message: "That username is already taken." }, { status: 409 });

    const params = new URLSearchParams({
      role: input.role,
      name: input.name.trim(),
      username: input.username.trim(),
      bio: input.bio.trim(),
    });

    if (input.portfolioUrl) params.set("portfolioUrl", input.portfolioUrl.trim());
    if (input.companyName) params.set("companyName", input.companyName.trim());
    if (input.productUrl) params.set("productUrl", input.productUrl.trim());

    return NextResponse.json({
      email: input.email,
      onboardingParams: params.toString(),
      encodedEmail: encode(input.email),
    });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Invalid signup profile.";
    return NextResponse.json({ message: message || "Invalid signup profile." }, { status: 400 });
  }
}