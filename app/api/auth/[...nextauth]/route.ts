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

function analyticsOwnerEmail() {
  return cleanEnv(process.env.SEEDENV_ANALYTICS_OWNER_EMAIL)?.toLowerCase();
}

const authEmailFrom = cleanEnv(process.env.AUTH_EMAIL_FROM) || "SeedEnv Authentication <auth@seedenv.com>";

const seedenvLogo = `<img src="https://seedenv.com/seedenv-logo-v2.png" alt="SeedEnv" width="88" height="95" style="display:block;width:88px;height:95px;border-radius:22px;margin:0 auto;object-fit:cover;box-shadow:0 18px 48px rgba(245,158,11,0.18);" />`;

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
            subject: "Your SeedEnv access link is ready",
            text: `Your SeedEnv access link is ready:\n${url}\n\nThis one-time link opens your selected SeedEnv workspace. If you did not request this login, you can safely ignore this email.`,
            html: `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:#090A0F;background-image:radial-gradient(circle at 22% 0%,rgba(109,40,217,0.22),transparent 30%),radial-gradient(circle at 78% 12%,rgba(245,158,11,0.14),transparent 24%);font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#F8FAFC;">
                <tr>
                  <td align="center" style="padding:42px 14px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid #1F2430;background:#0E1017;border-radius:28px;box-shadow:0 28px 90px rgba(0,0,0,0.48);overflow:hidden;">
                      <tr>
                        <td style="padding:1px;background:linear-gradient(90deg,rgba(245,158,11,0.55),rgba(109,40,217,0.5),rgba(16,185,129,0.35));"></td>
                      </tr>
                      <tr>
                        <td align="center" style="padding:40px 28px 34px;background:#0E1017;">
                          ${seedenvLogo}
                          <p style="margin:28px 0 0;color:#F59E0B;font-size:12px;font-weight:800;letter-spacing:0.26em;text-transform:uppercase;">SeedEnv secure access</p>
                          <h1 style="margin:14px 0 0;color:#FFFFFF;font-size:34px;line-height:1.05;font-weight:900;letter-spacing:-0.045em;">Enter your workspace</h1>
                          <p style="margin:18px auto 0;max-width:430px;color:#A1A1AA;font-size:16px;line-height:1.65;">Use this one-time access link to continue into SeedEnv. Your selected tester or developer path will open after verification.</p>
                          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:30px auto 0;">
                            <tr>
                              <td align="center" style="border-radius:14px;background:linear-gradient(90deg,#F59E0B,#D97706);box-shadow:0 16px 36px rgba(245,158,11,0.18);border:1px solid rgba(251,191,36,0.36);">
                                <a href="${url}" style="display:inline-block;color:#090A0F;padding:15px 30px;font-size:15px;font-weight:900;text-decoration:none;border-radius:14px;">Authenticate &amp; Continue</a>
                              </td>
                            </tr>
                          </table>
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 0;border:1px solid #1F2430;background:#090A0F;border-radius:18px;">
                            <tr>
                              <td style="padding:18px 20px;text-align:left;">
                                <p style="margin:0;color:#D4D4D8;font-size:13px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;">Access link expires soon</p>
                                <p style="margin:8px 0 0;color:#71717A;font-size:13px;line-height:1.55;">For your account security, use the button from the same device and browser where you requested access.</p>
                              </td>
                            </tr>
                          </table>
                          <p style="margin:28px 0 0;color:#71717A;font-size:13px;line-height:1.6;">If you did not request this login, you can safely ignore this email.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
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
        const shouldPromoteOwner = Boolean(user.email && analyticsOwnerEmail() === user.email.toLowerCase());
        if (shouldPromoteOwner && user.role !== UserRole.DEVELOPER) {
          await prisma.user.update({ where: { id: user.id }, data: { role: UserRole.DEVELOPER } });
        }
        token.role = shouldPromoteOwner ? UserRole.DEVELOPER : user.role || UserRole.TESTER;
      } else if (token.id) {
        const currentUser = await prisma.user.findUnique({
          where: { id: token.id },
          select: { role: true },
        });
        if (currentUser) token.role = currentUser.role;
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