"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const COPY_FEEDBACK_MS = 2_000;

/** Tracks which copy trigger (by key) just succeeded, resetting after two seconds. */
export function useCopyFeedback<Key extends string = "default">() {
  const [copiedKey, setCopiedKey] = useState<Key | null>(null);
  const [failedKey, setFailedKey] = useState<Key | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = useCallback(async (text: string, key = "default" as Key) => {
    window.clearTimeout(timer.current);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(text);
      setFailedKey(null);
      setCopiedKey(key);
      timer.current = window.setTimeout(() => setCopiedKey(null), COPY_FEEDBACK_MS);
      return true;
    } catch {
      setCopiedKey(null);
      setFailedKey(key);
      timer.current = window.setTimeout(() => setFailedKey(null), COPY_FEEDBACK_MS * 2);
      return false;
    }
  }, []);

  return { copiedKey, failedKey, copy, isCopied: (key = "default" as Key) => copiedKey === key };
}
