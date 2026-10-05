export const landingViews = [
  { id: "overview", label: "Overview", title: "SeedEnv" },
  { id: "developers", label: "Developers", title: "Developer Platform" },
  { id: "validators", label: "Validators", title: "Validator Protocol" },
  { id: "cohorts", label: "Cohorts", title: "Active Cohorts" },
  { id: "circle", label: "Launch Circle", title: "Launch Circle" },
  { id: "pricing", label: "Pricing", title: "Cohort Pricing" },
  { id: "mobile", label: "PWA", title: "SeedEnv Mobile Console" },
] as const;

export type LandingView = (typeof landingViews)[number]["id"];

export function resolveLandingView(value: unknown): LandingView {
  return landingViews.find((view) => view.id === value)?.id || "overview";
}

export function landingViewHref(view: LandingView) {
  return view === "overview" ? "/" : `/?view=${view}`;
}