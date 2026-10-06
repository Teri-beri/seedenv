"use client";

import { useEffect } from "react";

type AnalyticsEventName = "page_view" | "cta_click" | "mission_open" | "signup_start";

function sessionKey() {
  const key = "seedenv-analytics-session";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(key, created);
  return created;
}

function pageLoadMs() {
  const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!entry) return undefined;
  const value = entry.loadEventEnd || entry.domContentLoadedEventEnd;
  return value > 0 ? Math.round(value) : undefined;
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
