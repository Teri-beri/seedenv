"use client";

import { useEffect } from "react";

type AnalyticsEventName = "page_view" | "cta_click" | "mission_open" | "signup_start" | "engagement";

export const ENGAGEMENT_IDLE_MS = 60_000;
const activityEvents = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;

// Counts foreground time; a segment stops counting once input has been idle for idleMs.
export function createEngagementTimer(now: () => number, idleMs = ENGAGEMENT_IDLE_MS) {
  let total = 0;
  let activeSince: number | null = null;
  let lastActivity = 0;
  const pause = (at = now()) => {
    if (activeSince === null) return;
    total += Math.max(0, Math.min(at, lastActivity + idleMs) - activeSince);
    activeSince = null;
  };
  return {
    activity() {
      const at = now();
      if (activeSince !== null && at - lastActivity > idleMs) pause(at);
      lastActivity = at;
      if (activeSince === null) activeSince = at;
    },
    pause,
    take() {
      const at = now();
      const resume = activeSince !== null && at - lastActivity <= idleMs;
      pause(at);
      const value = Math.round(total);
      total = 0;
      if (resume) activeSince = at;
      return value;
    },
  };
}

function sessionKey() {
  try {
    const key = "seedenv-analytics-session";
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(key, created);
    return created;
  } catch (error) {
    console.warn("SeedEnv analytics session storage is unavailable:", error);
    return undefined;
  }
}

type NavigationLoad = Pick<PerformanceNavigationTiming, "name" | "loadEventEnd" | "domContentLoadedEventEnd">;
const reportedLoads = new WeakSet<PerformanceEntry>();

export function navigationLoadMs(entry: NavigationLoad | undefined, pathname: string) {
  if (!entry) return undefined;
  if (new URL(entry.name).pathname !== pathname) return undefined;
  const value = entry.loadEventEnd || entry.domContentLoadedEventEnd;
  return value > 0 ? Math.round(value) : undefined;
}

function pageLoadMs() {
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!entry || reportedLoads.has(entry)) return undefined;
  const value = navigationLoadMs(entry, window.location.pathname);
  if (value !== undefined) reportedLoads.add(entry);
  return value;
}

function send(eventName: AnalyticsEventName, metadata?: Record<string, string>, extra?: Record<string, unknown>) {
  void fetch("/api/analytics/collect", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, path: window.location.pathname, sessionKey: sessionKey(), metadata, ...extra }),
  }).catch(() => undefined);
}

export function trackAnalytics(eventName: AnalyticsEventName, metadata?: Record<string, string>) {
  if (typeof window === "undefined") return;
  send(eventName, metadata);
}

export function AnalyticsTracker() {
  useEffect(() => {
    const path = window.location.pathname;
    const timer = createEngagementTimer(() => performance.now());
    const visible = () => document.visibilityState === "visible";
    const flush = () => {
      const engagedMs = timer.take();
      if (engagedMs >= 1000) send("engagement", undefined, { path, engagedMs });
    };
    const onActivity = () => {
      if (visible()) timer.activity();
    };
    const onVisibility = () => {
      if (visible()) return timer.activity();
      timer.pause();
      flush();
    };
    if (visible()) timer.activity();
    for (const name of activityEvents) window.addEventListener(name, onActivity, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      for (const name of activityEvents) window.removeEventListener(name, onActivity, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  useEffect(() => {
    const context = {
      referrer: document.referrer || undefined,
      utmSource: new URLSearchParams(window.location.search).get("utm_source") || undefined,
    };
    const report = () => send("page_view", undefined, { ...context, loadMs: pageLoadMs() });
    if (document.readyState === "complete") {
      report();
      return;
    }
    let sent = false;
    const once = () => {
      if (sent) return;
      sent = true;
      window.setTimeout(report, 0);
    };
    window.addEventListener("load", once, { once: true });
    const fallback = window.setTimeout(once, 4000);
    return () => {
      window.removeEventListener("load", once);
      window.clearTimeout(fallback);
    };
  }, []);
  return null;
}
