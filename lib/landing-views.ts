export const landingViews = [
  { id: "overview", label: "Overview", title: "SeedEnv", anchor: "top" },
  { id: "tools", label: "Free tools", title: "Free Developer Tools", anchor: "free-tools" },
  { id: "cohorts", label: "Cohorts", title: "Active Cohorts", anchor: "cohorts" },
  { id: "developers", label: "Developers", title: "Developer Platform", anchor: "engine" },
  { id: "validators", label: "Validators", title: "Validator Protocol", anchor: "validators" },
  { id: "pricing", label: "Pricing", title: "Cohort Pricing", anchor: "pricing" },
  { id: "mobile", label: "PWA", title: "SeedEnv Mobile Console", anchor: "pwa" },
] as const;

export type LandingView = (typeof landingViews)[number]["id"] | "circle";

export function resolveLandingView(value: unknown): LandingView {
  if (value === "circle") return "circle";
  return landingViews.find((view) => view.id === value)?.id || "overview";
}

export function landingViewHref(view: LandingView) {
  if (view === "circle") return "/launch-circle";
  return `#${landingViews.find((item) => item.id === view)?.anchor || "top"}`;
}

export function landingSectionReached(top: number, scrollPadding: number, scrollMargin: number) {
  // Fragment targets combine both offsets; allow for rounding and retain the prior minimum.
  return top <= Math.max(130, scrollPadding + scrollMargin + 2);
}
