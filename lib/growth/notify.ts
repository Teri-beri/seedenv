import type { GrowthConfig } from "@/lib/growth/config";
import type { GrowthLogger } from "@/lib/growth/log";
import { fetchJson, withRetry } from "@/lib/growth/retry";

export type CardAction = { label: string; url: string; style?: "primary" | "danger" };
export type CardSection = { markdown: string; actions?: CardAction[] };
export type ReviewCard = { title: string; sections: CardSection[] };

const truncate = (text: string, max: number) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

export function cardToMarkdown(card: ReviewCard) {
  return [`**${card.title}**`, ...card.sections.map((section) => [section.markdown, section.actions?.map((action) => `[${action.label}](${action.url})`).join("  ·  ")].filter(Boolean).join("\n"))].join("\n\n");
}

// Delivers to every configured channel; a channel failure is logged and never fails the pipeline (the drafts stay in the database).
export function createNotifier(config: GrowthConfig["notify"], logger: GrowthLogger, options: { dryRun?: boolean } = {}) {
  const send = async (channel: string, work: () => Promise<unknown>) => {
    try {
      await withRetry(work, { label: `notify:${channel}`, logger, attempts: 3 });
      return channel;
    } catch (error) {
      logger.error("notify_failed", { channel, error });
      return null;
    }
  };

  async function dispatch(card: ReviewCard): Promise<string[]> {
    if (options.dryRun) {
      logger.info("notify_dry_run", { card: cardToMarkdown(card) });
      return ["stdout"];
    }
    const jobs: Array<Promise<string | null>> = [];
    if (config.slackWebhookUrl) jobs.push(send("slack", () => fetch(config.slackWebhookUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: card.title,
        blocks: [{ type: "header", text: { type: "plain_text", text: truncate(card.title, 150) } }, ...card.sections.flatMap((section) => [
          { type: "section", text: { type: "mrkdwn", text: truncate(section.markdown.replace(/\*\*(.+?)\*\*/g, "*$1*"), 2900) } },
          ...(section.actions?.length ? [{ type: "actions", elements: section.actions.map((action) => ({ type: "button", text: { type: "plain_text", text: action.label }, url: action.url, ...(action.style ? { style: action.style } : {}) })) }] : []),
        ])].slice(0, 50),
      }),
      signal: AbortSignal.timeout(15_000),
    }).then((response) => { if (!response.ok) throw Object.assign(new Error(`Slack ${response.status}`), { status: response.status }); })));
    if (config.discordWebhookUrl) jobs.push(send("discord", () => fetch(config.discordWebhookUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: truncate(cardToMarkdown(card).replace(/\]\((https?:[^)]+)\)/g, "](<$1>)"), 1990), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(15_000),
    }).then((response) => { if (!response.ok) throw Object.assign(new Error(`Discord ${response.status}`), { status: response.status }); })));
    if (config.telegramBotToken && config.telegramChatId) jobs.push(send("telegram", () => fetchJson(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text: truncate([card.title, ...card.sections.map((section) => section.markdown.replace(/\*\*/g, ""))].join("\n\n"), 4000),
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: card.sections.flatMap((section) => section.actions?.length ? [section.actions.map((action) => ({ text: action.label, url: action.url }))] : []).slice(0, 20) },
      }),
    })));
    if (!jobs.length) {
      logger.warn("notify_unconfigured", { card: cardToMarkdown(card) });
      return [];
    }
    return (await Promise.all(jobs)).filter((channel): channel is string => Boolean(channel));
  }

  return { dispatch, alert: (title: string, markdown: string) => dispatch({ title, sections: [{ markdown }] }) };
}
export type GrowthNotifier = ReturnType<typeof createNotifier>;
