"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Activity, ArrowRight, CornerDownLeft, FolderKanban, Radar, RefreshCw, Search, Trophy, Vault, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { refreshSystemStatus, useLiveSystemStatus } from "@/lib/live-system-status";

type PaletteCommand =
  | { id: string; kind: "navigate"; label: string; hint: string; keywords: string; icon: LucideIcon; href: string }
  | { id: string; kind: "status"; label: string; hint: string; keywords: string; icon: LucideIcon };

const commands: ReadonlyArray<PaletteCommand> = [
  { id: "swarm", kind: "navigate", label: "SwarmForensics Bot Detector", hint: "/tools/swarm-detector", keywords: "swarm bot detector forensics comments audit", icon: Radar, href: "/tools/swarm-detector" },
  { id: "drops", kind: "navigate", label: "Campaign Drops", hint: "/campaigns", keywords: "campaign drops cohorts console developer launch", icon: FolderKanban, href: "/campaigns" },
  { id: "vault", kind: "navigate", label: "Developer Vault & Escrow", hint: "/billing", keywords: "vault escrow billing balance invoices payments developer", icon: Vault, href: "/billing" },
  { id: "rewards", kind: "navigate", label: "Tester Rewards & Missions", hint: "/tester/rewards", keywords: "tester rewards missions bounties validator flight deck", icon: Trophy, href: "/tester/rewards" },
  { id: "status", kind: "status", label: "System Operational Status", hint: "Live check", keywords: "system status operational uptime latency health", icon: Activity },
];

export const OPEN_COMMAND_PALETTE_EVENT = "seedenv:open-command-palette";

function matches(command: PaletteCommand, query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${command.label} ${command.hint} ${command.keywords}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

function modifierLabel() {
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || "";
  return /mac|iphone|ipad/i.test(platform) ? "⌘" : "Ctrl";
}

const overlayClass = "palette-overlay fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm";
const panelClass = "palette-panel fixed left-1/2 top-[12vh] z-[61] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#09090b]/95 text-zinc-200 shadow-2xl shadow-black/60 backdrop-blur-xl focus:outline-none";

export function CommandPalette() {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [modifier, setModifier] = useState("⌘");

  const results = useMemo(() => commands.filter((command) => matches(command, query)), [query]);
  const safeIndex = results.length ? Math.min(activeIndex, results.length - 1) : -1;

  const openPalette = useCallback(() => {
    setModifier(modifierLabel());
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.repeat) return;
      event.preventDefault();
      setStatusOpen(false);
      if (open) setOpen(false);
      else openPalette();
    };
    const onOpenRequest = () => openPalette();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    };
  }, [open, openPalette]);

  const run = useCallback((command: PaletteCommand | undefined) => {
    if (!command) return;
    setOpen(false);
    if (command.kind === "status") {
      void refreshSystemStatus();
      setStatusOpen(true);
    } else {
      router.push(command.href);
    }
  }, [router]);

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((safeIndex + step + results.length) % results.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : results.length - 1);
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      run(results[safeIndex]);
    }
  };

  const optionId = (index: number) => `${listId}-option-${index}`;

  return <>
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClass} />
        <Dialog.Content className={panelClass} aria-describedby={undefined} onOpenAutoFocus={(event) => { event.preventDefault(); inputRef.current?.focus(); }}>
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-4">
            <Search aria-hidden="true" className="size-4 shrink-0 text-zinc-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={onInputKeyDown}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={safeIndex >= 0 ? optionId(safeIndex) : undefined}
              aria-label="Search commands"
              placeholder="Jump to a tool, dashboard, or status…"
              autoComplete="off"
              spellCheck={false}
              className="min-h-14 w-full min-w-0 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline">ESC</kbd>
          </div>
          <ul id={listId} role="listbox" aria-label="Commands" className="max-h-[min(60vh,22rem)] overflow-y-auto p-2">
            {results.map((command, index) => {
              const Icon = command.icon;
              const active = index === safeIndex;
              return <li
                key={command.id}
                id={optionId(index)}
                role="option"
                aria-selected={active}
                onPointerMove={() => { if (!active) setActiveIndex(index); }}
                onClick={() => run(command)}
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors ${active ? "bg-emerald-500/10 text-emerald-100" : "text-zinc-300"}`}
              >
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg border ${active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-zinc-800 bg-zinc-900 text-zinc-400"}`}><Icon aria-hidden="true" className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{command.label}</span>
                  <span className="block truncate font-mono text-[11px] text-zinc-500">{command.hint}</span>
                </span>
                {active ? <CornerDownLeft aria-hidden="true" className="size-3.5 shrink-0 text-emerald-400" /> : null}
              </li>;
            })}
            {!results.length ? <li role="presentation" className="px-3 py-10 text-center">
              <Search aria-hidden="true" className="mx-auto size-5 text-zinc-600" />
              <p className="mt-3 text-sm text-zinc-400">No command matches “{query.trim()}”.</p>
              <p className="mt-1 font-mono text-[11px] text-zinc-600">Try “swarm”, “escrow”, or “status”.</p>
            </li> : null}
          </ul>
          <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
            <span className="hidden sm:inline">↑↓ navigate · ↵ open</span>
            <span><kbd className="text-zinc-400">{modifier} K</kbd> toggle</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <SystemStatusDialog open={statusOpen} onOpenChange={setStatusOpen} />
  </>;
}

function SystemStatusDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className={overlayClass} />
      <Dialog.Content className={panelClass} aria-describedby={undefined}>
        <SystemStatusBody onNavigate={() => onOpenChange(false)} />
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

// Mounted only while the dialog is open, so the status poller never runs in the background on every page.
function SystemStatusBody({ onNavigate }: { onNavigate: () => void }) {
  const status = useLiveSystemStatus();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    await refreshSystemStatus();
    setRefreshing(false);
  };

  const headline = status.phase === "checking" ? "Checking systems…"
    : status.phase === "unreachable" ? "Status endpoint unreachable"
      : status.overall === "operational" ? "All systems operational" : "Partial degradation";
  const headlineTone = status.phase === "ready" ? (status.overall === "operational" ? "text-emerald-300" : "text-amber-300") : status.phase === "unreachable" ? "text-rose-300" : "text-zinc-400";

  return <>
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] p-5">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">System operational status</p>
            <Dialog.Title className={`mt-1.5 text-lg font-semibold ${headlineTone}`}>{headline}</Dialog.Title>
          </div>
          <Dialog.Close aria-label="Close status" className="grid size-11 shrink-0 place-items-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"><X aria-hidden="true" className="size-4" /></Dialog.Close>
        </div>
        <div className="p-5">
          <dl className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="rounded-xl border border-white/[0.08] bg-zinc-950 p-3"><dt className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Round trip</dt><dd className="mt-1 text-base tabular-nums text-zinc-100">{status.phase === "ready" ? `${status.latencyMs}ms` : "—"}</dd></div>
            <div className="rounded-xl border border-white/[0.08] bg-zinc-950 p-3"><dt className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Last check</dt><dd className="mt-1 text-base tabular-nums text-zinc-100">{status.phase === "checking" ? "—" : new Date(status.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</dd></div>
          </dl>
          {status.phase === "checking" ? <ul aria-busy="true" className="mt-4 space-y-2">{[0, 1, 2, 3].map((item) => <li key={item} className="h-11 animate-pulse rounded-xl bg-zinc-900/80" />)}</ul> : null}
          {status.phase === "unreachable" ? <p role="alert" className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-sm text-rose-200">We couldn’t reach the status endpoint. Check your connection, then refresh.</p> : null}
          {status.phase === "ready" ? <ul className="mt-4 space-y-2">{status.services.map((service) => <li key={service.id} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-zinc-950 px-3 py-2">
            <span className="min-w-0 truncate text-sm text-zinc-300">{service.name}</span>
            <span className={`inline-flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] ${service.state === "operational" ? "text-emerald-300" : "text-amber-300"}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${service.state === "operational" ? "bg-emerald-500" : "bg-amber-500"}`} />{service.state}</span>
          </li>)}</ul> : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => { void refresh(); }} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-zinc-800 px-4 text-sm text-zinc-300 transition hover:border-emerald-500/40 hover:text-emerald-200 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">
              <RefreshCw aria-hidden="true" className={`size-4 ${refreshing ? "motion-safe:animate-spin" : ""}`} />{refreshing ? "Checking…" : "Re-check now"}
            </button>
            <Link href="/status" onClick={onNavigate} className="inline-flex min-h-11 items-center gap-1.5 text-sm text-zinc-400 transition hover:text-emerald-300">Full status page <ArrowRight aria-hidden="true" className="size-3.5" /></Link>
          </div>
        </div>
  </>;
}
