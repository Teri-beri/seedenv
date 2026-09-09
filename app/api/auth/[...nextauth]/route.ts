import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient, UserRole } from "@prisma/client";
import { Resend } from "resend";
import NextAuth, { type NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";

const prisma = new PrismaClient();

const seedenvLogo = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
  <defs>
    <linearGradient id="seGrad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#FBBF24" />
      <stop offset="50%" stop-color="#D97706" />
      <stop offset="100%" stop-color="#7C3AED" />
    </linearGradient>
    <radialGradient id="seGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#090A0F" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect x="2" y="2" width="44" height="44" rx="12" fill="#0E1017" stroke="#262A36" stroke-width="1.5" />
  <circle cx="24" cy="24" r="16" fill="url(#seGlow)" />
  <path d="M24 10C24 10 32 16 32 24C32 29.5 27.5 34 22 34C16.5 34 13 29.5 13 25C13 18 20 13 24 10Z" fill="url(#seGrad)" />
  <path d="M24 10C26 15 28 20 28 24C28 27.3 25.3 30 22 30C18.7 30 16.5 27.5 16.5 25C16.5 21 21 16 24 10Z" fill="#0E1017" />
  <circle cx="24" cy="18" r="2.5" fill="#FDE68A" />
  <circle cx="34" cy="34" r="2" fill="#A78BFA" />
</svg>`;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    EmailProvider({
      server: {
        host: "smtp.resend.com",
        port: 465,
        auth: {
          user: "resend",
          pass: process.env.RESEND_API_KEY,
        },
      },
      from: "SeedEnv Authentication <auth@mail.seedenv.com>",
      async sendVerificationRequest({ identifier: email, url, provider }) {
        if (!process.env.RESEND_API_KEY) {
          throw new Error("RESEND_API_KEY is required to send SeedEnv login emails.");
        }

        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
            from: provider.from,
            to: email,
            subject: "Verify your SeedEnv login",
            html: `
              <div style="background:#090A0F;padding:40px 16px;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#FFFFFF;">
                <div style="max-width:520px;margin:0 auto;border:1px solid #1F2430;background:rgba(14,16,23,0.92);border-radius:20px;padding:32px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,0.38);">
                  <div style="margin:0 auto 24px;width:48px;height:48px;">${seedenvLogo}</div>
                  <p style="margin:0 0 10px;color:#F59E0B;font-size:12px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;">SeedEnv secure access</p>
                  <h1 style="margin:0;color:#F8FAFC;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.03em;">Authenticate your login</h1>
                  <p style="margin:18px 0 30px;color:#A1A1AA;font-size:16px;line-height:1.6;">Use this one-time link to complete your SeedEnv sign-in and verify access to your workspace.</p>
                  <a href="${url}" style="display:inline-block;background:linear-gradient(90deg,#F59E0B,#D97706);color:#090A0F;padding:14px 28px;font-weight:800;font-size:15px;text-decoration:none;border-radius:12px;border:1px solid rgba(251,191,36,0.32);box-shadow:0 12px 32px rgba(245,158,11,0.16);">Authenticate Login &amp; 2FA</a>
                  <p style="margin:32px 0 0;color:#71717A;font-size:13px;line-height:1.6;">If you did not request this login, you can safely ignore this email.</p>
                </div>
              </div>
            `,
          });
          console.log(`SeedEnv magic link successfully sent to ${email}`);
        } catch (error) {
          console.error("Error sending SeedEnv verification email:", error);
          throw new Error("SEND_VERIFICATION_EMAIL_ERROR");
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role || UserRole.TESTER;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };