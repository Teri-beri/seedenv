import type { RobloxAuditFocus } from "@prisma/client";

export const ROBLOX_AUDIT_FOCUS_LABELS: Record<RobloxAuditFocus, string> = {
  MOBILE_GUI_SCALING: "Mobile GUI scaling",
  LOW_END_MEMORY_THROTTLE: "Low-end memory throttle",
  CONCURRENT_SERVER_STRESS: "Concurrent server stress",
  DATASTORE_EXPLOIT_VERIFICATION: "DataStore exploit verification",
  CONSOLE_CONTROLLER_MAPPING: "Console controller mapping",
};

export function isRobloxExperienceUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:"
      && (url.hostname === "roblox.com" || url.hostname.endsWith(".roblox.com"))
      && /^\/games\/\d+(?:\/|$)/.test(url.pathname);
  } catch {
    return false;
  }
}
