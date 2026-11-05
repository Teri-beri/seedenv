import type { SignalCode } from "@/lib/swarm-api/scoring";

export const SWARM_API_ENDPOINT = "https://seedenv.com/api/v1/moderate";

export const swarmSignalGlossary: ReadonlyArray<{ code: SignalCode; label: string; description: string }> = [
  { code: "copy_paste_cluster", label: "Copy-paste cluster", description: "Identical text arrived from other accounts in the last 24 hours." },
  { code: "coordinated_phrasing", label: "Coordinated phrasing", description: "Near-identical wording shared across several distinct accounts." },
  { code: "burst_window", label: "Burst window", description: "Matching comments from multiple accounts landed within 10 minutes." },
  { code: "same_thread_brigade", label: "Same-thread brigade", description: "Matching accounts converged on one thread at the same time." },
  { code: "author_flood", label: "Author flood", description: "One author posted an unusual number of comments in 10 minutes." },
  { code: "self_repeat", label: "Self repeat", description: "One author pasted the same text into several different threads." },
  { code: "link_heavy", label: "Link heavy", description: "Several links, or links from a brand-new account." },
  { code: "new_account", label: "New account", description: "Amplifier only: the author is under 2 days old and other signals fired." },
];

export const curlExample = `curl -X POST ${SWARM_API_ENDPOINT} \\
  -H "Authorization: Bearer $SEEDENV_SWARM_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "text": "This update is a scam, everyone cancel now",
    "authorId": "user_8812",
    "threadId": "post_311",
    "commentId": "c_90211",
    "authorAccountAgeDays": 0.4
  }'`;

export const nodeExample = `// Fail open: never block real users if the check is slow or unavailable.
export async function screenComment(comment) {
  try {
    const response = await fetch("${SWARM_API_ENDPOINT}", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${process.env.SEEDENV_SWARM_KEY}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: comment.body,
        authorId: comment.userId,
        threadId: comment.postId,
        commentId: comment.id,
      }),
      signal: AbortSignal.timeout(1500),
    });
    const verdict = await response.json();
    return verdict.action; // "allow" | "review" | "hold"
  } catch {
    return "allow";
  }
}`;

export const responseExample = `{
  "id": "mod_cm3x…",
  "commentId": "c_90211",
  "action": "hold",
  "score": 82,
  "signals": [
    { "code": "copy_paste_cluster", "weight": 30, "detail": "Identical text posted by 4 other accounts in the last 24h." },
    { "code": "coordinated_phrasing", "weight": 30, "detail": "Near-identical phrasing shared with 4 other accounts." },
    { "code": "burst_window", "weight": 20, "detail": "4 matching accounts posted within 10 minutes." }
  ],
  "cluster": { "size": 4, "sameThread": 4, "inBurstWindow": 4 },
  "thresholds": { "review": 40, "hold": 70 },
  "plan": "STARTER",
  "usage": { "used": 1288, "limit": 10000, "remaining": 8712, "resetsAt": "2026-12-01T00:00:00.000Z" }
}`;

export const webhookVerifyExample = `import { createHmac, timingSafeEqual } from "node:crypto";

// Header: SeedEnv-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.rawBody">
export function verifySeedEnvSignature(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(\`\${parts.t}.\${rawBody}\`).digest();
  const received = Buffer.from(parts.v1 ?? "", "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}`;
