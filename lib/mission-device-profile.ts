import { z } from "zod";
import { collectHardwareSignals } from "@/lib/hardware-integrity";

export const missionDeviceProfileSchema = z.object({
  platform: z.enum(["IOS", "IPADOS", "ANDROID", "OTHER"]),
  osVersion: z.string().trim().min(1).max(80),
  browser: z.string().trim().min(1).max(80),
  estimatedModel: z.string().trim().min(1).max(120),
  modelCandidates: z.array(z.string().trim().min(1).max(120)).max(8),
  screenWidth: z.number().int().min(1).max(10000),
  screenHeight: z.number().int().min(1).max(10000),
  devicePixelRatio: z.number().min(0.5).max(10),
  gpuRenderer: z.string().trim().max(200).nullable(),
  touchPoints: z.number().int().min(0).max(100),
  isMobile: z.boolean(),
}).strict();

export type MissionDeviceProfile = z.infer<typeof missionDeviceProfileSchema>;

const appleViewportModels: Record<string, string[]> = {
  "320x568@2": ["iPhone SE (1st generation)", "iPhone 5s"],
  "375x667@2": ["iPhone SE (2nd or 3rd generation)", "iPhone 8"],
  "375x812@3": ["iPhone 11 Pro", "iPhone XS", "iPhone X"],
  "390x844@3": ["iPhone 14", "iPhone 13", "iPhone 12"],
  "393x852@3": ["iPhone 16", "iPhone 15 Pro", "iPhone 15", "iPhone 14 Pro"],
  "402x874@3": ["iPhone 16 Pro"],
  "414x896@2": ["iPhone 11", "iPhone XR"],
  "414x896@3": ["iPhone 11 Pro Max", "iPhone XS Max"],
  "428x926@3": ["iPhone 14 Plus", "iPhone 13 Pro Max", "iPhone 12 Pro Max"],
  "430x932@3": ["iPhone 15 Pro Max", "iPhone 15 Plus", "iPhone 14 Pro Max"],
  "440x956@3": ["iPhone 16 Pro Max", "iPhone 16 Plus"],
  "744x1133@2": ["iPad mini (6th generation)"],
  "810x1080@2": ["iPad (10th generation)", "iPad Air"],
  "820x1180@2": ["iPad Air 10.9-inch", "iPad Pro 11-inch"],
  "1024x1366@2": ["iPad Pro 12.9-inch"],
};

function normalizedViewport(width: number, height: number, dpr: number) {
  const short = Math.min(Math.round(width), Math.round(height));
  const long = Math.max(Math.round(width), Math.round(height));
  return `${short}x${long}@${Math.round(dpr)}`;
}

export function inferMissionDevice(input: {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
}) {
  const isIPadDesktopAgent = /Macintosh/i.test(input.userAgent) && input.maxTouchPoints > 1;
  const isIPad = /iPad/i.test(input.userAgent) || isIPadDesktopAgent;
  const isIOS = /iPhone|iPod/i.test(input.userAgent);
  const isAndroid = /Android/i.test(input.userAgent);
  const key = normalizedViewport(input.screenWidth, input.screenHeight, input.devicePixelRatio);
  const appleCandidates = appleViewportModels[key] || [];

  if (isIOS || isIPad) {
    const platform = isIPad ? "IPADOS" : "IOS";
    const fallback = isIPad ? "iPad (model confirmation required)" : "iPhone (model confirmation required)";
    return { platform, candidates: appleCandidates, estimatedModel: appleCandidates[0] || fallback } as const;
  }

  if (isAndroid) {
    const rawModel = input.userAgent.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/[^;)]+)?[;)]/i)?.[1]?.trim();
    const model = rawModel && !/^(wv|mobile|tablet)$/i.test(rawModel) ? rawModel : "Android device (model confirmation required)";
    return { platform: "ANDROID", candidates: rawModel ? [model] : [], estimatedModel: model } as const;
  }

  return {
    platform: "OTHER",
    candidates: [],
    estimatedModel: `${input.platform || "Unknown"} device`,
  } as const;
}

export async function collectMissionDeviceProfile(): Promise<MissionDeviceProfile> {
  const width = window.screen?.width || window.innerWidth;
  const height = window.screen?.height || window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const userAgent = navigator.userAgent;
  const detected = inferMissionDevice({
    userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    screenWidth: width,
    screenHeight: height,
    devicePixelRatio: dpr,
  });
  const hardware = await collectHardwareSignals().catch(() => null);
  const osVersion = detected.platform === "IOS" || detected.platform === "IPADOS"
    ? `iOS ${userAgent.match(/OS\s+([0-9_]+)/)?.[1]?.replace(/_/g, ".") || "version hidden"}`
    : detected.platform === "ANDROID"
      ? `Android ${userAgent.match(/Android\s+([0-9.]+)/)?.[1] || "version hidden"}`
      : navigator.platform || "Unknown OS";
  const browser = /CriOS|Chrome/i.test(userAgent) ? "Chrome" : /FxiOS|Firefox/i.test(userAgent) ? "Firefox" : /Safari/i.test(userAgent) ? "Safari" : "Browser";

  return missionDeviceProfileSchema.parse({
    platform: detected.platform,
    osVersion,
    browser,
    estimatedModel: detected.estimatedModel,
    modelCandidates: detected.candidates,
    screenWidth: Math.round(width),
    screenHeight: Math.round(height),
    devicePixelRatio: Math.round(dpr * 100) / 100,
    gpuRenderer: hardware?.gpuRenderer || null,
    touchPoints: navigator.maxTouchPoints,
    isMobile: detected.platform !== "OTHER",
  });
}

export function parseMissionDeviceProfile(value: unknown) {
  const parsed = missionDeviceProfileSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
