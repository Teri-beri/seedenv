import { Resend } from "resend";

export function notificationEnabled(value: unknown, key: string, fallback: boolean) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const setting = (value as Record<string, unknown>)[key];
  return typeof setting === "boolean" ? setting : fallback;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

export async function sendNotificationEmail(to: string, subject: string, text: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim().replace(/^['"]|['"]$/g, "");
  if (!apiKey) return false;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.AUTH_EMAIL_FROM?.trim() || "SeedEnv Authentication <auth@seedenv.com>",
      to,
      subject,
      text,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</div>`,
    });
    if (error) {
      console.warn("SeedEnv notification email failed:", error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("SeedEnv notification email failed:", error);
    return false;
  }
}