"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, LoaderCircle, QrCode, RefreshCw, X } from "lucide-react";
import Image from "next/image";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MissionDeviceProfile } from "@/lib/mission-device-profile";

export type MissionPairClientState = {
  id: string;
  submissionId: string;
  channelKey: string;
  activeStep: number;
  completedSteps: number[];
  compact: boolean;
  deviceProfile: MissionDeviceProfile | null;
  confirmedDeviceModel: string | null;
  connectedAt: string | null;
  recordingConfirmedAt: string | null;
  proofSubmittedAt: string | null;
  lastSeenAt: string | null;
  expiresAt: string;
  updatedAt: string;
};

export type PairedMissionSession = {
  state: MissionPairClientState;
  token: string | null;
  realtime: { key: string; cluster: string } | null;
};

type PairingResponse = PairedMissionSession & {
  pairUrl: string;
  code: string;
};

type PairingModalProps = {
  open: boolean;
  submissionId: string;
  activeStep: number;
  completedSteps: number[];
  compact: boolean;
  onClose: () => void;
  onSessionReady: (session: PairedMissionSession) => void;
};

export function PairingModal({ open, submissionId, activeStep, completedSteps, compact, onClose, onSessionReady }: PairingModalProps) {
  const [pairing, setPairing] = useState<PairingResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const requestState = useRef({ activeStep, completedSteps, compact });

  const createPairing = useCallback(() => {
    requestState.current = { activeStep, completedSteps, compact };
    setPairing(null);
    setQrDataUrl("");
    setError(null);
    setRequestVersion((current) => current + 1);
  }, [activeStep, completedSteps, compact]);

  useEffect(() => {
    if (!open) requestState.current = { activeStep, completedSteps, compact };
  }, [activeStep, completedSteps, compact, open]);

  useEffect(() => {
    if (!open || !submissionId) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void (async () => {
      setPairing(null);
      setQrDataUrl("");
      setError(null);
      try {
        const response = await fetch("/api/mission-pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ submissionId, ...requestState.current }),
          signal: controller.signal,
        });
        const payload = await response.json() as PairingResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Could not create a secure pairing session.");
        const dataUrl = await QRCode.toDataURL(payload.pairUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 384,
          color: { dark: "#E4E4E7", light: "#18181B" },
        });
        if (controller.signal.aborted) return;
        setPairing(payload);
        setQrDataUrl(dataUrl);
        onSessionReady({ state: payload.state, token: payload.token, realtime: payload.realtime });
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not create a secure pairing session.");
      }
    })(), 0);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, submissionId, onSessionReady, requestVersion]);

  useEffect(() => {
    if (!open || !pairing || pairing.state.connectedAt) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/mission-pair/${encodeURIComponent(pairing.state.id)}`, {
          cache: "no-store",
          headers: { Authorization: `Bearer ${pairing.token}` },
        });
        const payload = await response.json() as { state?: MissionPairClientState; error?: string };
        if (!response.ok || !payload.state) throw new Error(payload.error || "Pair status could not be refreshed.");
        if (cancelled) return;
        setPairing((current) => current ? { ...current, state: payload.state as MissionPairClientState } : current);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Pair status could not be refreshed.");
      }
    };
    const interval = window.setInterval(() => void poll(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [open, pairing]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.96, opacity: 0, y: 18 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 18 }} className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-[#0A0D12] p-5 shadow-2xl shadow-sky-500/10">
            <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-lg border border-zinc-800 p-2 text-zinc-400 transition hover:text-white" aria-label="Close pairing">
              <X className="size-4" />
            </button>

            <div className="flex items-center gap-2 text-sky-300">
              <QrCode className="size-4" />
              <p className="text-[10px] font-mono uppercase tracking-[0.25em]">Pair mobile session</p>
            </div>
            <h3 className="mt-3 text-xl font-semibold text-white">Sync your live mission</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Scan this encrypted link with the testing phone. Your computer keeps the mission steps while the phone launches the build and submits evidence.</p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["1", "Scan", "Use the testing phone"],
                ["2", "Sign in", "Your slot stays reserved"],
                ["3", "Launch", "Open the test build"],
              ].map(([number, title, detail]) => (
                <div key={number} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 text-center">
                  <span className="mx-auto grid size-6 place-items-center rounded-full bg-sky-500 text-[10px] font-bold text-zinc-950">{number}</span>
                  <p className="mt-2 text-xs font-semibold text-white">{title}</p>
                  <p className="mt-1 text-[9px] leading-4 text-zinc-500">{detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex min-h-60 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
              {qrDataUrl ? <Image src={qrDataUrl} unoptimized width={208} height={208} alt="QR code containing the secure SeedEnv mission pairing link" className="h-52 w-52 rounded-lg" /> : error ? (
                <div className="text-center">
                  <p className="text-sm text-rose-300">{error}</p>
                  <button type="button" onClick={createPairing} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-white hover:border-zinc-600">
                    <RefreshCw className="size-3.5" /> Retry pairing
                  </button>
                </div>
              ) : <LoaderCircle className="size-7 animate-spin text-sky-400" />}
            </div>

            {pairing ? (
              <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/75 p-3 text-center">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">Verification code</p>
                <p className="mt-2 font-mono text-lg text-emerald-300">{pairing.code}</p>
                <div className={`mt-3 flex items-center justify-center gap-2 text-xs font-mono ${pairing.state.connectedAt ? "text-emerald-300" : "text-amber-300"}`}>
                  {pairing.state.connectedAt ? <CheckCircle2 className="size-3.5" /> : <span className="inline-flex size-2 animate-pulse rounded-full bg-amber-400" />}
                  {pairing.state.connectedAt ? "MOBILE DEVICE CONNECTED" : "WAITING FOR MOBILE DEVICE"}
                </div>
              </div>
            ) : null}

            <button type="button" onClick={onClose} className="mt-5 w-full rounded-xl bg-sky-500 px-4 py-3 text-xs font-bold tracking-tight text-zinc-950 transition hover:bg-sky-400">
              Resume Mission →
            </button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
