import { sendDiscordWebhookMessage } from "@/lib/discord";
import { notificationEnabled, sendNotificationEmail } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

export async function dispatchCriticalIncidentAlert(incidentId: string) {
  const incident = await prisma.telemetryIncident.findUnique({
    where: { id: incidentId },
    select: {
      id: true,
      severity: true,
      statusCode: true,
      endpoint: true,
      deviceModel: true,
      osVersion: true,
      message: true,
      cohort: {
        select: {
          id: true,
          title: true,
          developer: { select: { email: true, discordWebhookUrl: true, notificationPreferences: true } },
        },
      },
    },
  });
  if (!incident || incident.severity !== "CRITICAL") return false;

  const origin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "https://seedenv.com";
  const monitorUrl = new URL(`/console/monitor?cohort=${encodeURIComponent(incident.cohort.id)}&incident=${encodeURIComponent(incident.id)}`, origin).toString();
  const endpoint = incident.endpoint || "Unspecified runtime surface";
  const text = [
    `CRITICAL TELEMETRY INCIDENT DETECTED`,
    "",
    `Service degraded on ${incident.cohort.title}.`,
    `Error / code: ${incident.statusCode}`,
    `Surface: ${endpoint}`,
    `Hardware: ${incident.deviceModel} (${incident.osVersion})`,
    `Details: ${incident.message}`,
    "",
    `Inspect incident: ${monitorUrl}`,
  ].join("\n");
  const html = `<div style="background:#0A0D12;color:#E4E4E7;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:28px;border-radius:12px;max-width:540px;margin:0 auto;border:1px solid #7F1D1D">
    <div style="font-size:11px;color:#EF4444;margin-bottom:8px">● CRITICAL TELEMETRY INCIDENT DETECTED</div>
    <h2 style="color:#FFF;font-size:18px;margin:0 0 12px">Service Degraded on ${escapeHtml(incident.cohort.title)}</h2>
    <p style="color:#A1A1AA;font-size:13px;line-height:1.5;margin-bottom:20px">An active tester node reported an unhandled exception or critical degradation threshold.</p>
    <div style="background:#12161F;border:1px solid #27272A;border-radius:8px;padding:14px;margin-bottom:20px;font-size:12px">
      <div style="color:#EF4444;font-weight:bold;margin-bottom:6px">Error / Code: ${escapeHtml(incident.statusCode)}</div>
      <div style="color:#D4D4D8;margin-bottom:4px">Surface: ${escapeHtml(endpoint)}</div>
      <div style="color:#D4D4D8;margin-bottom:4px">Hardware: ${escapeHtml(incident.deviceModel)} (${escapeHtml(incident.osVersion)})</div>
      <div style="color:#A1A1AA">Details: ${escapeHtml(incident.message)}</div>
    </div>
    <div style="text-align:center"><a href="${escapeHtml(monitorUrl)}" style="display:inline-block;background:#EF4444;color:#FFF;font-weight:bold;font-size:12px;text-decoration:none;padding:10px 20px;border-radius:6px">Inspect Incident in Live Console →</a></div>
  </div>`;

  const jobs: Promise<unknown>[] = [];
  if (notificationEnabled(incident.cohort.developer.notificationPreferences, "email_telemetry_incidents", true)) {
    jobs.push(sendNotificationEmail(
      incident.cohort.developer.email,
      `[SeedEnv Incident] Service Degraded on ${incident.cohort.title}`,
      text,
      `telemetry-incident-${incident.id}`,
      { from: process.env.TELEMETRY_EMAIL_FROM?.trim() || "SeedEnv Telemetry Monitor <alerts@seedenv.com>", html },
    ));
  }
  if (incident.cohort.developer.discordWebhookUrl) {
    jobs.push(sendDiscordWebhookMessage(incident.cohort.developer.discordWebhookUrl, `🚨 **SeedEnv critical incident**\n**${incident.cohort.title}** · ${incident.statusCode}\n${incident.deviceModel} (${incident.osVersion}) · ${endpoint}\n${incident.message}\n${monitorUrl}`)
      .then((response) => {
        if (!response.ok) console.warn("SeedEnv incident Discord alert failed:", response.status);
        return response.ok;
      }));
  }
  await Promise.all(jobs);
  return jobs.length > 0;
}
