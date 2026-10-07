"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Pause, Play, RotateCcw, Terminal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { trackAnalytics } from "@/components/analytics-tracker";

type Severity = "P0" | "P1" | "P2";

export type SandboxScenario = {
  id: string;
  platform: "iOS" | "Android" | "Web";
  channel: string;
  title: string;
  summary: string;
  severity: Severity;
  device: string;
  os: string;
  build: string;
  network: string;
  signal: { label: string; value: string };
  stipend: string;
  slots: { filled: number; total: number };
  steps: string[];
  expected: string;
  actual: string;
  reproRate: string;
  recording: { durationSec: number; frames: Array<{ at: number; screen: string; detail: string; tone?: "error" | "warn" }> };
  stackTrace: string;
  logs: string[];
  attachments: string[];
};

export const sandboxScenarios: SandboxScenario[] = [
  {
    id: "stripe-3ds-testflight",
    platform: "iOS",
    channel: "TestFlight",
    title: "Stripe PaymentSheet hangs after 3DS challenge",
    summary: "Sandbox card 4000 0027 6000 3184 completes 3D Secure, then the sheet spins until the 30s timeout and no PaymentIntent confirmation reaches the app.",
    severity: "P0",
    device: "iPhone 16 Pro",
    os: "iOS 18.2 (22C152)",
    build: "2.4.0 (311)",
    network: "5G, 42 ms RTT",
    signal: { label: "Checkout timeout", value: "30.0s" },
    stipend: "$15.00",
    slots: { filled: 18, total: 25 },
    steps: [
      "Sign in with a fresh TestFlight account and add any item to the cart.",
      "Tap Checkout, then Pay with card and enter Stripe test card 4000 0027 6000 3184.",
      "Approve the 3D Secure challenge in the in-app browser.",
      "Wait on the PaymentSheet after the challenge closes.",
    ],
    expected: "Sheet dismisses within 2s and the order receipt screen opens.",
    actual: "Spinner stays for 30s, then \"Something went wrong\". The PaymentIntent shows succeeded in the Stripe test dashboard, so the customer is charged without a receipt.",
    reproRate: "7 of 9 testers (78%)",
    recording: {
      durationSec: 38,
      frames: [
        { at: 0, screen: "Cart", detail: "1 × Trail Runner Hoodie · $64.00" },
        { at: 5, screen: "PaymentSheet", detail: "Card 4000 0027 6000 3184 entered" },
        { at: 11, screen: "3D Secure", detail: "Stripe test challenge · tapped Complete" },
        { at: 16, screen: "PaymentSheet", detail: "Processing… (spinner)", tone: "warn" },
        { at: 31, screen: "PaymentSheet", detail: "Still processing at +15s", tone: "warn" },
        { at: 35, screen: "Alert", detail: "\"Something went wrong. Try again.\"", tone: "error" },
      ],
    },
    stackTrace: `StripePaymentSheet.PaymentSheetError.unknown(debugDescription: "redirect return URL not handled")
  0  StripePaymentSheet   PaymentSheet.confirm(_:) + 412
  1  StripePayments       STPPaymentHandler._handleWillForeground() + 188
  2  Shopwave             CheckoutCoordinator.presentPaymentSheet() (CheckoutCoordinator.swift:147)
  3  Shopwave             SceneDelegate.scene(_:openURLContexts:) (SceneDelegate.swift:61)
  4  UIKitCore            -[UIApplication _handleDelegateCallbacksWithOptions:] + 1124
  5  libdispatch.dylib    _dispatch_call_block_and_release + 32
Caused by: returnURL "shopwave://stripe-redirect" not forwarded to StripeAPI.handleURLCallback(with:)`,
    logs: [
      "14:02:11.204 POST /v1/payment_intents/pi_3Q…/confirm → 200 (requires_action)",
      "14:02:17.880 3DS2 challenge completed (transStatus=Y)",
      "14:02:17.902 openURL shopwave://stripe-redirect?payment_intent=pi_3Q… (unhandled)",
      "14:02:47.913 PaymentSheet timeout after 30000 ms",
    ],
    attachments: ["reproduction.mp4 (38s)", "network.har", "device-console.log"],
  },
  {
    id: "websocket-handoff-android",
    platform: "Android",
    channel: "Play Console internal",
    title: "Live stream WebSocket drops on Wi-Fi → LTE handoff",
    summary: "Leaving Wi-Fi mid-stream kills the chat socket. The client never reconnects, so viewers keep watching video but chat and reactions freeze silently.",
    severity: "P1",
    device: "Pixel 8",
    os: "Android 15 (AP4A.250105.002)",
    build: "5.12.0 (5120)",
    network: "Wi-Fi → LTE, 18% packet loss",
    signal: { label: "Packet loss", value: "18%" },
    stipend: "$12.00",
    slots: { filled: 12, total: 20 },
    steps: [
      "Join any live stream on Wi-Fi and send a chat message.",
      "Walk out of Wi-Fi range (or toggle Wi-Fi off) so the phone moves to LTE.",
      "Send another chat message and wait 60 seconds.",
    ],
    expected: "Socket reconnects within 5s and queued messages are delivered.",
    actual: "Video continues but chat shows no new messages. The sent message stays grey with no error. Only leaving and re-entering the stream recovers it.",
    reproRate: "5 of 6 testers (83%)",
    recording: {
      durationSec: 52,
      frames: [
        { at: 0, screen: "Live stream", detail: "Chat flowing · 1.2k viewers" },
        { at: 8, screen: "Live stream", detail: "Sent \"hello from the Pixel\" ✓" },
        { at: 17, screen: "Status bar", detail: "Wi-Fi lost → LTE", tone: "warn" },
        { at: 24, screen: "Live stream", detail: "Sent \"still here?\" · stuck grey", tone: "warn" },
        { at: 44, screen: "Live stream", detail: "No chat for 20s, video still playing", tone: "error" },
      ],
    },
    stackTrace: `java.net.SocketException: Software caused connection abort
  at java.net.SocketInputStream.socketRead0(Native Method)
  at okio.InputStreamSource.read(JvmOkio.kt:94)
  at okhttp3.internal.ws.WebSocketReader.readHeader(WebSocketReader.kt:117)
  at okhttp3.internal.ws.RealWebSocket.loopReader(RealWebSocket.kt:293)
  at com.streamly.chat.ChatSocket$listener$1.onFailure(ChatSocket.kt:88)
  at com.streamly.chat.ReconnectPolicy.schedule(ReconnectPolicy.kt:41)
Caused by: ReconnectPolicy skipped retry: lastNetwork=WIFI, currentNetwork=null (callback raced ConnectivityManager)`,
    logs: [
      "09:41:03.512 ws open wss://chat.streamly.app/v3 (rtt 38 ms)",
      "09:41:20.077 ConnectivityManager onLost(network 101 WIFI)",
      "09:41:20.081 ws failure: SocketException (connection abort)",
      "09:41:20.083 ReconnectPolicy: no active network, retry not scheduled",
      "09:41:21.410 ConnectivityManager onAvailable(network 102 CELLULAR)",
    ],
    attachments: ["reproduction.mp4 (52s)", "logcat.txt", "packet-capture.pcap"],
  },
];

const severityTone: Record<Severity, string> = {
  P0: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  P1: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  P2: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};

export function SandboxBadge() {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 font-mono text-xs text-zinc-400" title="Sample scenarios for illustration, not live customer data">
      <span className="relative flex h-2 w-2" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="font-semibold text-zinc-200">Interactive Sandbox</span>
      <span className="text-zinc-600 max-[419px]:hidden" aria-hidden="true">|</span>
      <span className="text-emerald-400 max-[419px]:hidden">v1.2 Telemetry Schema</span>
      <span className="sr-only">: sample scenarios, not live customer data</span>
    </div>
  );
}

export function ScenarioCard({ scenario, onInspect }: { scenario: SandboxScenario; onInspect: () => void }) {
  const progress = Math.round((scenario.slots.filled / scenario.slots.total) * 100);
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-white/10 bg-[#0F1117] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
        <span className="border border-white/10 px-2 py-0.5 text-emerald-300">{scenario.platform} · {scenario.channel}</span>
        <span className={`border px-2 py-0.5 ${severityTone[scenario.severity]}`}>{scenario.severity}</span>
      </div>
      <h3 className="mt-3 text-sm font-semibold leading-5 text-white">{scenario.title}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
        <div className="min-w-0"><dt className="text-zinc-500">Device</dt><dd className="break-words text-zinc-200">{scenario.device} · {scenario.os.split(" (")[0]}</dd></div>
        <div className="min-w-0"><dt className="text-zinc-500">{scenario.signal.label}</dt><dd className="truncate text-amber-300">{scenario.signal.value}</dd></div>
      </dl>
      <div className="mt-3 flex items-center justify-between gap-3 font-mono text-xs"><span className="text-amber-300">{scenario.stipend} / validator</span><span className="text-zinc-400">{scenario.slots.filled} / {scenario.slots.total} slots</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-zinc-800" role="progressbar" aria-label={`${scenario.title} sample slots filled`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full bg-emerald-500" style={{ width: `${progress}%` }} /></div>
      <button type="button" onClick={onInspect} className="mt-4 inline-flex min-h-11 items-center gap-1.5 self-start rounded-md font-mono text-xs text-emerald-300 transition-colors hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" aria-haspopup="dialog">
        Inspect Scenario <ArrowRight className="size-3.5" aria-hidden="true" />
      </button>
    </article>
  );
}

const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

function RecordingMock({ scenario }: { scenario: SandboxScenario }) {
  const { durationSec, frames } = scenario.recording;
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setTime((current) => {
        const next = Math.min(durationSec, current + 0.25);
        if (next >= durationSec) setPlaying(false);
        return next;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, durationSec]);

  const frame = [...frames].reverse().find((item) => item.at <= time) ?? frames[0];
  const frameTone = frame.tone === "error" ? "border-rose-500/50 text-rose-200" : frame.tone === "warn" ? "border-amber-500/40 text-amber-200" : "border-white/10 text-zinc-200";
  const ended = time >= durationSec;

  return (
    <figure className="rounded-lg border border-white/10 bg-black/40 p-3">
      <div className="flex items-center justify-between font-mono text-[11px] text-zinc-500"><span>reproduction.mp4 · {scenario.device}</span><span className="flex items-center gap-1.5"><span className={`size-1.5 rounded-full ${playing ? "bg-rose-500" : "bg-zinc-600"}`} />{playing ? "PLAYING" : ended ? "ENDED" : "PAUSED"}</span></div>
      <div className="mt-3 flex justify-center">
        <div className="relative h-56 w-28 rounded-[1.4rem] border-2 border-zinc-700 bg-[#0B0E14] p-1.5 shadow-inner" aria-hidden="true">
          <div className="mx-auto h-2.5 w-10 rounded-full bg-zinc-800" />
          <div className={`mt-2 flex h-[11.5rem] flex-col justify-between rounded-xl border bg-zinc-900/70 p-2 transition-colors ${frameTone}`}>
            <p className="font-mono text-[9px] uppercase tracking-wide text-zinc-500">{frame.screen}</p>
            {frame.detail.includes("spinner") || frame.detail.startsWith("Still processing") ? <span className="mx-auto size-6 animate-spin rounded-full border-2 border-zinc-700 border-t-emerald-400 motion-reduce:animate-none" /> : <span className="mx-auto h-8 w-14 rounded bg-zinc-800" />}
            <p className="text-[10px] leading-snug">{frame.detail}</p>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">Simulated screen recording. Current frame at {clock(time)}: {frame.screen}, {frame.detail}.</figcaption>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => { if (ended) setTime(0); setPlaying((value) => !value || ended); }} className="grid size-9 shrink-0 place-items-center rounded-md border border-white/10 text-zinc-200 hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400" aria-label={playing ? "Pause recording" : ended ? "Replay recording" : "Play recording"}>
          {playing ? <Pause className="size-4" /> : ended ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
        </button>
        <input type="range" min={0} max={durationSec} step={0.25} value={time} onChange={(event) => { setTime(Number(event.target.value)); }} className="h-1 flex-1 accent-emerald-500" aria-label="Seek recording" />
        <span className="font-mono text-[11px] text-zinc-400">{clock(time)} / {clock(durationSec)}</span>
      </div>
      <ol className="mt-3 space-y-1 font-mono text-[11px]">
        {frames.map((item) => (
          <li key={item.at}>
            <button type="button" onClick={() => { setTime(item.at); setPlaying(false); }} className={`flex w-full gap-2 rounded px-1.5 py-0.5 text-left hover:bg-white/5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 ${item === frame ? "bg-white/5 text-white" : item.tone === "error" ? "text-rose-300" : item.tone === "warn" ? "text-amber-300" : "text-zinc-400"}`}>
              <span className="text-zinc-500">{clock(item.at)}</span><span>{item.screen}: {item.detail}</span>
            </button>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function ScenarioDrawer({ scenario, onOpenChange, onStartCohort }: { scenario: SandboxScenario | null; onOpenChange: (open: boolean) => void; onStartCohort: () => void }) {
  return (
    <Dialog.Root open={scenario !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-white/10 bg-[#0F1117] text-white shadow-2xl focus:outline-none">
          {scenario ? (
            <>
              <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-mono text-[11px] text-zinc-500"><Terminal className="size-3.5 text-emerald-400" aria-hidden="true" /> Sandbox scenario · sample data</p>
                  <Dialog.Title className="mt-2 text-lg font-semibold leading-6">{scenario.title}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm leading-6 text-zinc-400">{scenario.summary}</Dialog.Description>
                </div>
                <Dialog.Close asChild><button type="button" aria-label="Close scenario" className="grid size-11 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"><X className="size-5" /></button></Dialog.Close>
              </header>
              <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10 font-mono text-[11px] sm:grid-cols-3">
                  {[["Severity", scenario.severity], ["Device", scenario.device], ["OS", scenario.os], ["Build", scenario.build], ["Network", scenario.network], ["Reproduced", scenario.reproRate]].map(([label, value]) => (
                    <div key={label} className="bg-[#0F1117] p-3"><dt className="text-zinc-500">{label}</dt><dd className={`mt-1 break-words ${label === "Severity" ? severityTone[scenario.severity].split(" ").at(-1) : "text-zinc-200"}`}>{value}</dd></div>
                  ))}
                </dl>
                <section aria-labelledby="scenario-recording"><h3 id="scenario-recording" className="mb-2 font-mono text-xs uppercase text-zinc-400">Screen recording</h3><RecordingMock key={scenario.id} scenario={scenario} /></section>
                <section aria-labelledby="scenario-steps">
                  <h3 id="scenario-steps" className="font-mono text-xs uppercase text-zinc-400">Steps to reproduce</h3>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-zinc-300">{scenario.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"><p className="font-mono text-[11px] uppercase text-emerald-400">Expected</p><p className="mt-1 text-sm leading-6 text-zinc-300">{scenario.expected}</p></div>
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3"><p className="font-mono text-[11px] uppercase text-rose-400">Actual</p><p className="mt-1 text-sm leading-6 text-zinc-300">{scenario.actual}</p></div>
                  </div>
                </section>
                <section aria-labelledby="scenario-trace"><h3 id="scenario-trace" className="font-mono text-xs uppercase text-zinc-400">Stack trace</h3><pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[11px] leading-5 text-rose-200"><code>{scenario.stackTrace}</code></pre></section>
                <section aria-labelledby="scenario-logs"><h3 id="scenario-logs" className="font-mono text-xs uppercase text-zinc-400">Device &amp; network log</h3><pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[11px] leading-5 text-zinc-300"><code>{scenario.logs.join("\n")}</code></pre></section>
                <section aria-labelledby="scenario-attachments"><h3 id="scenario-attachments" className="font-mono text-xs uppercase text-zinc-400">Attachments</h3><ul className="mt-2 flex flex-wrap gap-2 font-mono text-[11px]">{scenario.attachments.map((file) => <li key={file} className="rounded border border-white/10 px-2 py-1 text-zinc-300">{file}</li>)}</ul></section>
              </div>
              <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
                <p className="text-xs text-zinc-500">Real cohorts return reports in this format from your testers.</p>
                <button type="button" onClick={onStartCohort} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400">Start a cohort <ArrowRight className="size-4" aria-hidden="true" /></button>
              </footer>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function useScenarioInspector() {
  const [active, setActive] = useState<SandboxScenario | null>(null);
  return {
    active,
    inspect(scenario: SandboxScenario) {
      trackAnalytics("cta_click", { action: "inspect_scenario", scenario: scenario.id });
      setActive(scenario);
    },
    onOpenChange(open: boolean) { if (!open) setActive(null); },
  };
}
