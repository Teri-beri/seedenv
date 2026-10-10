"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { z } from "zod";
import { saveLaunchWizardDraft } from "@/app/actions/launchDraftActions";
import { launchDraftKey, launchWizardDraftSchema, type LaunchWizardDraft } from "@/lib/launch-wizard-draft";

const recoverySchema = z.object({ revision: z.number().int().min(0), draft: launchWizardDraftSchema });

export function useLaunchAutosave({ userId, sourceDraftId, revision: initialRevision, draft, restore, enabled }: {
  userId: string; sourceDraftId?: string; revision: number; draft: LaunchWizardDraft; restore: (draft: LaunchWizardDraft) => void; enabled: boolean;
}) {
  const storageKey = `seedenv:launch-draft:v1:${userId}:${launchDraftKey(sourceDraftId)}`;
  const revision = useRef(initialRevision);
  const latest = useRef(draft);
  const saved = useRef(JSON.stringify(draft));
  const inFlight = useRef<Promise<void> | null>(null);
  const stopped = useRef(false);
  const ready = useRef(false);
  const [status, setStatus] = useState("Saved to your account");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { latest.current = draft; }, [draft]);
  const recover = useEffectEvent(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const recovery = recoverySchema.parse(JSON.parse(raw));
        if (recovery.revision === revision.current) {
          latest.current = recovery.draft;
          restore(recovery.draft);
          setStatus("Recovered browser edits; saving to your account...");
        } else {
          setError("A newer account draft exists. Your older browser recovery copy was not applied.");
        }
      }
    } catch {
      setError("Browser recovery is unavailable or invalid. Account autosave will still be attempted.");
    }
  });
  const backup = useEffectEvent(() => {
    setStatus("Unsaved changes");
    try {
      localStorage.setItem(storageKey, JSON.stringify({ revision: revision.current, draft }));
    } catch {
      setError("Browser recovery storage is unavailable. Wait for account autosave before leaving.");
    }
  });

  const save = useCallback(async () => {
    if (inFlight.current) {
      await inFlight.current;
      return;
    }
    const work = async () => {
      while (!stopped.current && saved.current !== JSON.stringify(latest.current)) {
        const snapshot = latest.current;
        setStatus("Saving...");
        setError(null);
        try {
          const result = await saveLaunchWizardDraft({ sourceDraftId, expectedRevision: revision.current, draft: snapshot });
          revision.current = result.revision;
          saved.current = JSON.stringify(snapshot);
          try {
            if (saved.current === JSON.stringify(latest.current)) localStorage.removeItem(storageKey);
            else localStorage.setItem(storageKey, JSON.stringify({ revision: revision.current, draft: latest.current }));
          } catch {
            setError("Account save succeeded, but browser recovery storage is unavailable.");
          }
          setStatus("Saved to your account");
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Autosave failed. Keep this page open and try again.";
          setError(message);
          setStatus("Not saved to your account");
          throw cause;
        }
      }
    };
    inFlight.current = work();
    try {
      await inFlight.current;
    } finally {
      inFlight.current = null;
    }
  }, [sourceDraftId, storageKey]);

  useEffect(() => {
    if (!enabled || ready.current) return;
    ready.current = true;
    recover();
  }, [enabled, storageKey]);

  useEffect(() => {
    if (!enabled || !ready.current || stopped.current || saved.current === JSON.stringify(draft)) return;
    latest.current = draft;
    backup();
    const timer = setTimeout(() => { void save().catch(() => { /* The save function displays the failure. */ }); }, 700);
    return () => clearTimeout(timer);
  }, [draft, enabled, save, storageKey]);

  useEffect(() => {
    if (!enabled) return;
    const flush = () => { if (ready.current && !stopped.current) void save().catch(() => { /* Browser recovery retains failed saves. */ }); };
    const warn = (event: BeforeUnloadEvent) => {
      if (saved.current !== JSON.stringify(latest.current) && !stopped.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", warn);
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, save]);

  const clear = useCallback(async () => {
    stopped.current = true;
    try {
      if (inFlight.current) await inFlight.current;
      const result = await saveLaunchWizardDraft({ sourceDraftId, expectedRevision: revision.current, draft: null });
      revision.current = result.revision;
    } catch (cause) {
      stopped.current = false;
      throw cause;
    }
    try { localStorage.removeItem(storageKey); }
    catch { setError("Draft cleared from your account, but the browser recovery copy could not be removed."); }
  }, [sourceDraftId, storageKey]);

  return { status, error, flush: save, clear, retry: () => { setError(null); void save().catch(() => { /* Failure is displayed above. */ }); } };
}
