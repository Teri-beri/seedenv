export const dailyQuestXp = 5;
export const referralQuestXp = 200;
export const referralMonthlyLimit = 3;
export const startWindowHours = 24;

export const exchangeItems = [
  { id: "pass", name: "Discovery Pass", cost: 300, description: "Apply below the REP requirement where developers allow it. Acceptance is not guaranteed.", repeatable: true },
  { id: "violet", name: "Violet console accent", cost: 100, description: "A permanent violet accent for your quest console.", repeatable: false },
  { id: "emerald", name: "Emerald console accent", cost: 150, description: "A permanent emerald accent for your quest console.", repeatable: false },
] as const;

export const academyQuests = [
  { id: "expected", title: "Expected vs. actual", question: "Which report gives a developer the most useful information?", options: ["It is broken.", "I tapped Save, expected confirmation, but the draft disappeared.", "I dislike the app."], answer: 1 },
  { id: "steps", title: "Reproduction detective", question: "What makes a bug reproducible?", options: ["A clear sequence, environment, and observed result", "A dramatic title", "Posting it many times"], answer: 0 },
  { id: "privacy", title: "Proof without private data", question: "Before uploading proof, what should you do?", options: ["Include passwords", "Show every notification", "Remove personal data and use test accounts"], answer: 2 },
  { id: "severity", title: "Triage practice", question: "Which issue is usually more severe?", options: ["A slightly uneven icon", "A supported workflow loses saved data", "A color preference"], answer: 1 },
  { id: "accessibility", title: "Accessible forms", question: "What should a form field have?", options: ["A meaningful label and understandable errors", "Only a disappearing placeholder", "An unlabeled icon"], answer: 0 },
  { id: "duplicates", title: "Original signal", question: "You find an existing report of the same bug. What helps?", options: ["Copy it as your own", "Submit ten copies", "Provide new reproduction evidence when requested"], answer: 2 },
  { id: "screenshots", title: "Clear screenshots", question: "The best proof screenshot is...", options: ["An unrelated image", "Relevant, readable, and free of sensitive data", "A screenshot from someone else"], answer: 1 },
  { id: "feedback", title: "Constructive feedback", question: "Which comment is actionable?", options: ["The app is terrible", "Make it better", "The unlabeled button made checkout unclear; label it Continue"], answer: 2 },
  { id: "platform", title: "Environment matters", question: "What environment details help reproduce a mobile bug?", options: ["Device, OS, and app version", "Your password", "Your contacts"], answer: 0 },
  { id: "fix", title: "Retest a fix", question: "How should you verify a fix?", options: ["Assume it works", "Repeat the original steps on the fixed version", "Only check the logo"], answer: 1 },
  { id: "contrast", title: "Readable interfaces", question: "What is a useful readability check?", options: ["Check text contrast and increased text size", "Use the smallest possible text", "Hide all labels"], answer: 0 },
  { id: "scope", title: "Stay in the brief", question: "A mission asks for a safe test checkout. What should you use?", options: ["Real purchases without permission", "A developer-provided test environment", "Someone else's payment details"], answer: 1 },
] as const;

export function utcDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function applicationEligibility(rep: number, required: number, discoveryAllowed: boolean, discoveryMinimum: number) {
  if (rep >= required) return "standard" as const;
  return discoveryAllowed && rep >= discoveryMinimum ? "pass" as const : "locked" as const;
}
