export function isDiscordWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && ["discord.com", "discordapp.com"].includes(url.hostname)
      && /^\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+\/?$/.test(url.pathname)
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export async function sendDiscordWebhookMessage(webhookUrl: string, content: string) {
  if (!isDiscordWebhookUrl(webhookUrl)) throw new Error("Invalid Discord webhook URL.");
  return fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
}