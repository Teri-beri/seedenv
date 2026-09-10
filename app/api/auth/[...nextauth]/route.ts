import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient, UserRole } from "@prisma/client";
import { Resend } from "resend";
import NextAuth, { type NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";

const prisma = new PrismaClient();
const authEmailFrom = process.env.AUTH_EMAIL_FROM || "SeedEnv Authentication <auth@mail.seedenv.com>";

const seedenvLogo = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="34%" r="72%">
      <stop offset="0%" stop-color="#14563C" />
      <stop offset="45%" stop-color="#0E241B" />
      <stop offset="100%" stop-color="#090A0F" />
    </radialGradient>
    <linearGradient id="seed" x1="17" y1="7" x2="29" y2="27" gradientUnits="userSpaceOnUse">
      <stop stop-color="#F8E8D4" />
      <stop offset="0.45" stop-color="#B98348" />
      <stop offset="1" stop-color="#3C231A" />
    </linearGradient>
    <linearGradient id="root" x1="24" y1="22" x2="23" y2="42" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF7E8" />
      <stop offset="1" stop-color="#D8D1C2" />
    </linearGradient>
  </defs>
  <rect width="48" height="48" rx="10" fill="url(#bgGlow)" />
  <path d="M0 25C6 21 11 20 15 21C19 22 21 25 25 24C30 23 33 20 38 21C42 22 45 24 48 23V48H0V25Z" fill="#120F12" />
  <path d="M25 5C31 11 33 16 31 21C30 25 26 28 22 27C18 26 16 22 17 18C18 13 21 9 25 5Z" fill="url(#seed)" />
  <path d="M20 18C22 13 25 9 29 7" stroke="#FFF1DC" stroke-width="2.6" stroke-linecap="round" />
  <path d="M24 24C22 29 19 31 15 32" stroke="url(#root)" stroke-width="2.7" stroke-linecap="round" />
  <path d="M24 24C23 30 23 36 24 43" stroke="url(#root)" stroke-width="2.7" stroke-linecap="round" />
  <path d="M25 24C28 29 32 32 38 33" stroke="url(#root)" stroke-width="2.7" stroke-linecap="round" />
  <path d="M21 30C18 35 14 38 9 39" stroke="url(#root)" stroke-width="1.9" stroke-linecap="round" />
  <path d="M27 31C31 36 35 39 40 40" stroke="url(#root)" stroke-width="1.9" stroke-linecap="round" />
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
      from: authEmailFrom,
      async sendVerificationRequest({ identifier: email, url, provider }) {
        if (!process.env.RESEND_API_KEY) {
          throw new Error("RESEND_API_KEY is required to send SeedEnv login emails.");
        }

        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const { data, error } = await resend.emails.send({
            from: provider.from,
            to: email,
            subject: "Verify your SeedEnv login",
            text: `Authenticate your SeedEnv login: ${url}\n\nIf you did not request this login, you can safely ignore this email.`,
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
          if (error) {
            console.error("Resend rejected SeedEnv verification email:", error);
            throw new Error(error.message || "RESEND_SEND_ERROR");
          }
          console.log(`SeedEnv magic link successfully queued for ${email}: ${data?.id || "no-message-id"}`);
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