"use client";

import { useEffect } from "react";

function sessionKey() {
  const key = "seedenv-analytics-session";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(key, created);
  return created;
}

export function trackAnalytics(eventName: "page_view" | "cta_click" | "mission_open" | "signup_start", metadata?: Record<string, string>) {
  if (typeof window === "undefined") return;
  void fetch("/api/analytics/collect", {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, path: window.location.pathname, sessionKey: sessionKey(), metadata }),
  }).catch(() => undefined);
}

export function AnalyticsTracker() {
  useEffect(() => {
    trackAnalytics("page_view");
  }, []);
  return null;
}