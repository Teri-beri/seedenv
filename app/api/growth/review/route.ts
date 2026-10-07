import { NextRequest, NextResponse } from "next/server";
import { verifyReviewToken, type ReviewTarget } from "@/lib/growth/approval";
import { blogMeta } from "@/lib/growth/blog";
import { loadGrowthConfig } from "@/lib/growth/config";
import { reviewDecision } from "@/lib/growth/pipeline";
import { productionGrowthContext } from "@/lib/growth/server";

export const dynamic = "force-dynamic";

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

function page(title: string, body: string, status = 200) {
  return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${escape(title)} · SeedEnv growth review</title><style>
body{margin:0;background:#0A0D12;color:#e4e4e7;font:15px/1.6 ui-sans-serif,system-ui,sans-serif}main{max-width:820px;margin:0 auto;padding:40px 20px}
h1{font-size:22px;margin:0 0 6px}.k{font:12px ui-monospace,monospace;letter-spacing:.15em;text-transform:uppercase;color:#34d399}.m{color:#a1a1aa;font-size:13px}
pre{white-space:pre-wrap;word-break:break-word;background:#0f1117;border:1px solid #27272a;border-radius:10px;padding:16px;font:13px/1.6 ui-monospace,monospace;max-height:60vh;overflow:auto}
form{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:18px}input[type=text]{flex:1;min-width:220px;background:#0f1117;border:1px solid #3f3f46;border-radius:8px;color:#e4e4e7;padding:9px 12px}
button{border:0;border-radius:8px;padding:10px 18px;font-weight:600;cursor:pointer}.a{background:#10b981;color:#000}.r{background:#27272a;color:#fca5a5}.box{border:1px solid #27272a;border-radius:12px;padding:18px;margin-top:18px}
</style></head><body><main><p class="k">SeedEnv growth review</p>${body}</main></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

function target(token: string | null): { target: ReviewTarget | null; error?: string } {
  let config;
  try {
    config = loadGrowthConfig();
  } catch {
    return { target: null, error: "Growth engine configuration is invalid." };
  }
  if (!config.approvalSecret) return { target: null, error: "GROWTH_APPROVAL_SECRET is not configured." };
  const verified = token ? verifyReviewToken(config.approvalSecret, token) : null;
  return verified ? { target: verified } : { target: null, error: "This review link is invalid or has expired (links last 14 days)." };
}

// GET only renders a confirmation page so chat link previews and prefetchers can never approve anything.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const intent = request.nextUrl.searchParams.get("intent") === "reject" ? "reject" : "approve";
  const resolved = target(token);
  if (!resolved.target) return page("Link not valid", `<h1>Link not valid</h1><p>${escape(resolved.error!)}</p>`, 403);
  const ctx = productionGrowthContext();
  let heading = "";
  let preview = "";
  let state = "";
  if (resolved.target.kind === "content") {
    const drop = await ctx.store.getContentDrop(resolved.target.id);
    if (!drop) return page("Not found", "<h1>Draft not found</h1>", 404);
    const meta = blogMeta(drop.metadata);
    heading = `Article: ${drop.title}`;
    state = drop.status;
    preview = `<p class="m">/blog/${escape(drop.slug)} · keyword “${escape(drop.targetKeyword)}”</p><p>${escape(meta.metaDescription ?? "")}</p><pre>${escape(drop.markdownBody ?? "")}</pre>${meta.faq?.length ? `<pre>${escape(meta.faq.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join("\n\n"))}</pre>` : ""}`;
  } else {
    const post = await ctx.store.getSocialPost(resolved.target.id);
    if (!post) return page("Not found", "<h1>Post not found</h1>", 404);
    heading = `${post.platform.charAt(0)}${post.platform.slice(1).toLowerCase()} post`;
    state = post.status;
    preview = `<p class="m">Scheduled for ${escape(post.scheduledTime.toUTCString())} (moved later if that time has passed)${post.platform === "INSTAGRAM" ? "" : " · article link appended on approval"}</p><pre>${escape(post.postText)}</pre>${post.lastError ? `<p class="m">Last error: ${escape(post.lastError)}</p>` : ""}`;
  }
  const reviewable = ["DRAFTED", "APPROVED", "PENDING_APPROVAL", "FAILED"].includes(state);
  const form = reviewable ? `<div class="box"><form method="post"><input type="hidden" name="token" value="${escape(token!)}"><input type="text" name="note" maxlength="1000" placeholder="Optional note"><button class="${intent === "approve" ? "a" : "r"}" name="decision" value="${intent}">${intent === "approve" ? "Approve" : "Reject"}</button><button class="${intent === "approve" ? "r" : "a"}" name="decision" value="${intent === "approve" ? "reject" : "approve"}">${intent === "approve" ? "Reject instead" : "Approve instead"}</button></form></div>` : `<p class="m">Already reviewed.</p>`;
  return page(heading, `<h1>${escape(heading)}</h1><p class="m">Status: ${escape(state)}</p>${preview}${form}`);
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const decision = form?.get("decision");
  const resolved = target(typeof form?.get("token") === "string" ? (form!.get("token") as string) : null);
  if (!resolved.target) return page("Link not valid", `<h1>Link not valid</h1><p>${escape(resolved.error!)}</p>`, 403);
  if (decision !== "approve" && decision !== "reject") return page("Invalid", "<h1>Choose approve or reject.</h1>", 400);
  const note = typeof form?.get("note") === "string" ? (form!.get("note") as string) : undefined;
  const outcome = await reviewDecision(productionGrowthContext(), resolved.target, decision, note);
  return page(outcome.ok ? "Done" : "Not applied", `<h1>${outcome.ok ? "Done" : "Not applied"}</h1><p>${escape(outcome.message)}</p><p class="m">You can close this tab.</p>`, outcome.ok ? 200 : 409);
}
