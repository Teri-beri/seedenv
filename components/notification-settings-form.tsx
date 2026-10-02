"use client";

import { Bell, LoaderCircle, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { saveNotificationSettings, testDiscordWebhook, type NotificationPreferences } from "@/app/actions/accountActions";
import { Button } from "@/components/ui/button";

const preferencesList: Array<{ key: keyof NotificationPreferences; title: string; detail: string }> = [
  { key: "email_tester_feedback", title: "Tester feedback", detail: "Email me when testers submit feedback or proof." },
  { key: "email_ledger_updates", title: "Ledger updates", detail: "Email me about payouts, escrow, and ledger activity." },
  { key: "email_announcements", title: "Product announcements", detail: "Occasional SeedEnv product news and release notes." },
];

const inputClass = "w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition-all placeholder:text-neutral-600 focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20";

export function NotificationSettingsForm({
  initialPreferences,
  initialWebhookUrl,
}: {
  initialPreferences: NotificationPreferences;
  initialWebhookUrl: string;
}) {
  const [preferences, setPreferences] = useState(initialPreferences);
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [webhookMessage, setWebhookMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [webhookError, setWebhookError] = useState("");
  const [isPending, startTransition] = useTransition();

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setWebhookError("");
    startTransition(async () => {
      try {
        const result = await saveNotificationSettings({ notificationPreferences: preferences, discordWebhookUrl: webhookUrl });
        if (!result.ok) {
          setWebhookError(result.fieldErrors?.discordWebhookUrl || "");
          setMessage({ ok: false, text: result.message });
          return;
        }
        setMessage({ ok: true, text: "Notification settings saved." });
      } catch (error) {
        setMessage({ ok: false, text: error instanceof Error ? error.message : "Could not save notification settings." });
      }
    });
  }

  function testWebhook() {
    setWebhookMessage(null);
    setWebhookError("");
    startTransition(async () => {
      try {
        const result = await testDiscordWebhook(webhookUrl);
        if (!result.ok) {
          if (result.message.includes("webhook URL")) setWebhookError(result.message);
          setWebhookMessage({ ok: false, text: result.message });
          return;
        }
        setWebhookMessage({ ok: true, text: "Test message sent to Discord." });
      } catch (error) {
        setWebhookMessage({ ok: false, text: error instanceof Error ? error.message : "Could not test this webhook." });
      }
    });
  }

  return (
    <form className="space-y-6" onSubmit={save}>
      <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md sm:p-6">
        <div className="flex items-start gap-3">
          <Bell className="mt-1 size-5 text-amber-500" />
          <div>
            <h2 className="text-xl font-bold text-white">Email notifications</h2>
            <p className="mt-1 text-sm text-neutral-400">Choose which account updates reach your inbox.</p>
          </div>
        </div>
        <div className="mt-5 divide-y divide-[#1F2430]">
          {preferencesList.map(({ key, title, detail }) => (
            <label className="flex cursor-pointer items-center justify-between gap-4 py-4 first:pt-0 last:pb-0" key={key}>
              <span>
                <span className="block text-sm font-semibold text-neutral-200">{title}</span>
                <span className="mt-1 block text-xs leading-5 text-neutral-500">{detail}</span>
              </span>
              <span className="relative inline-flex shrink-0 items-center">
                <input
                  checked={preferences[key]}
                  className="peer sr-only"
                  onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))}
                  role="switch"
                  type="checkbox"
                />
                <span className="h-6 w-11 rounded-full bg-neutral-700 transition peer-checked:bg-amber-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-400" />
                <span className="pointer-events-none absolute left-1 size-4 rounded-full bg-white transition peer-checked:translate-x-5" />
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md sm:p-6">
        <div className="flex items-start gap-3">
          <Send className="mt-1 size-5 text-amber-500" />
          <div>
            <h2 className="text-xl font-bold text-white">Discord tester alerts</h2>
            <p className="mt-1 text-sm leading-6 text-neutral-400">Send real-time tester feedback alerts to a Discord channel using its webhook URL.</p>
          </div>
        </div>
        <label className="mt-5 block text-sm font-semibold text-neutral-300">
          Discord webhook URL
          <input
            aria-describedby={webhookError ? "discordWebhookUrl-error" : undefined}
            aria-invalid={Boolean(webhookError)}
            className={inputClass}
            onChange={(event) => { setWebhookUrl(event.target.value); setWebhookError(""); setWebhookMessage(null); }}
            placeholder="https://discord.com/api/webhooks/..."
            type="url"
            value={webhookUrl}
          />
          {webhookError ? <span className="mt-1 block text-xs font-normal text-red-300" id="discordWebhookUrl-error">{webhookError}</span> : null}
        </label>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button disabled={isPending || !webhookUrl.trim()} onClick={testWebhook} type="button" variant="ghost">
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />} Test Webhook
          </Button>
        </div>
        {webhookMessage ? <p className={`mt-3 text-sm ${webhookMessage.ok ? "text-emerald-300" : "text-red-300"}`} role="status">{webhookMessage.text}</p> : null}
      </section>

      {message ? <p className={`rounded-lg p-3 text-sm ${message.ok ? "bg-emerald-950/40 text-emerald-300" : "bg-red-950/40 text-red-300"}`} role={message.ok ? "status" : "alert"}>{message.text}</p> : null}
      <Button className="w-full sm:w-auto" disabled={isPending} type="submit">{isPending ? "Saving..." : "Save notification settings"}</Button>
    </form>
  );
}