import { rankThresholds } from "./rank";

export interface TaskPreset {
  id: string;
  category: "Core Flows" | "Stress & Performance" | "Commerce & Auth" | "Bug Hunting & Device";
  title: string;
  defaultDescription: string;
  estimatedMinutes: number;
}

export const SEED_TASK_PRESETS: TaskPreset[] = [
  {
    id: "first-time-onboarding",
    category: "Core Flows",
    title: "First-Time Onboarding & UX Teardown",
    defaultDescription: "Walk through initial signup, permission requests, and tutorial. Note confusing copy, friction points, or drop-offs.",
    estimatedMinutes: 5,
  },
  {
    id: "core-feature-smoke-test",
    category: "Core Flows",
    title: "Primary User Loop / Golden Path Test",
    defaultDescription: "Execute the core value loop (e.g., create content, search feed, send transaction, or join a room) and verify end-to-end success.",
    estimatedMinutes: 8,
  },
  {
    id: "dark-mode-visual-hierarchy",
    category: "Core Flows",
    title: "UI Visual Audit (Dark Mode & Dynamic Type)",
    defaultDescription: "Toggle Dark/Light modes and adjust system font scale to largest setting; check for truncated text and layout clipping.",
    estimatedMinutes: 5,
  },
  {
    id: "offline-reconnect",
    category: "Stress & Performance",
    title: "Airplane Mode & Offline Sync Resilience",
    defaultDescription: "Trigger actions while in Airplane Mode, reconnect to network, and verify state recovery, cached feeds, or retry handling.",
    estimatedMinutes: 7,
  },
  {
    id: "background-kill-resume",
    category: "Stress & Performance",
    title: "Background App Kill & Session Restore",
    defaultDescription: "Minimize app, force close from app switcher mid-action, reopen, and confirm state/session persistence.",
    estimatedMinutes: 5,
  },
  {
    id: "rapid-tap-stress",
    category: "Stress & Performance",
    title: "Rapid Interaction / Rage-Tap Stress Test",
    defaultDescription: "Rapidly spam action buttons, back swipes, and concurrent requests to check for double-firing, UI lockups, or memory spikes.",
    estimatedMinutes: 5,
  },
  {
    id: "auth-providers-test",
    category: "Commerce & Auth",
    title: "Social Auth & 2FA / Session Invalidation",
    defaultDescription: "Test Sign in with Apple, Google, or Magic Link; verify logout, session expiration, and credential re-entry.",
    estimatedMinutes: 6,
  },
  {
    id: "checkout-iap-sandbox",
    category: "Commerce & Auth",
    title: "StoreKit Sandbox / In-App Purchase Flow",
    defaultDescription: "Complete a sandbox TestFlight digital currency or subscription transaction; verify balance update and receipt delivery.",
    estimatedMinutes: 8,
  },
  {
    id: "screen-record-repro",
    category: "Bug Hunting & Device",
    title: "Exploratory Bug Bounty with Screen Recording",
    defaultDescription: "Freely explore unreleased features for 10 minutes with native screen recording; report reproducible crash logs and UI glitches.",
    estimatedMinutes: 10,
  },
  {
    id: "specific-device-screen-fit",
    category: "Bug Hunting & Device",
    title: "Device Notch, Island & Foldable Fit",
    defaultDescription: "Test on targeted hardware (Dynamic Island, home bar inset, or small SE screens) to verify touch targets are not obstructed.",
    estimatedMinutes: 5,
  },
];

export function resolveTaskMinimumRep(task: { presetId?: string; instructionTitle: string; minimumRep?: number }) {
  const preset = SEED_TASK_PRESETS.find((item) => task.presetId ? item.id === task.presetId : item.title === task.instructionTitle);
  const advanced = preset && preset.category !== "Core Flows" && preset.id !== "specific-device-screen-fit";
  return Math.max(task.minimumRep ?? 0, advanced ? rankThresholds.CORE_VALIDATOR.minXp : 0);
}
