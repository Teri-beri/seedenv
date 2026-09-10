import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient, UserRole } from "@prisma/client";
import { Resend } from "resend";
import NextAuth, { type NextAuthOptions } from "next-auth";
import EmailProvider from "next-auth/providers/email";

const prisma = new PrismaClient();

function cleanEnv(value: string | undefined) {
  return value?.trim().replace(/^['"]|['"]$/g, "");
}

function getResendApiKey() {
  return cleanEnv(process.env.RESEND_API_KEY);
}

const authEmailFrom = cleanEnv(process.env.AUTH_EMAIL_FROM) || "SeedEnv Authentication <auth@mail.seedenv.com>";

const seedenvLogo = `<img src="https://seedenv.com/seedenv-logo.png" alt="SeedEnv" width="72" height="78" style="display:block;width:72px;height:78px;border-radius:16px;margin:0 auto;object-fit:cover;" />`;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    EmailProvider({
      server: {
        host: "smtp.resend.com",
        port: 465,
        auth: {
          user: "resend",
          pass: getResendApiKey(),
        },
      },
      from: authEmailFrom,
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const resendApiKey = getResendApiKey();
        if (!resendApiKey) {
          throw new Error("RESEND_API_KEY is required to send SeedEnv login emails.");
        }
        if (!resendApiKey.startsWith("re_")) {
          throw new Error("RESEND_API_KEY must start with re_. Check for pasted quotes or the wrong Render environment value.");
        }

        try {
          const resend = new Resend(resendApiKey);
          const { data, error } = await resend.emails.send({
            from: provider.from,
            to: email,
            subject: "Verify your SeedEnv login",
            text: `Authenticate your SeedEnv login: ${url}\n\nIf you did not request this login, you can safely ignore this email.`,
            html: `
              <div style="background:#090A0F;padding:40px 16px;font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#FFFFFF;">
                <div style="max-width:520px;margin:0 auto;border:1px solid #1F2430;background:rgba(14,16,23,0.92);border-radius:20px;padding:32px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,0.38);">
                  <div style="margin:0 auto 24px;width:72px;height:78px;">${seedenvLogo}</div>
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
    error: "/auth/error",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };