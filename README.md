# SeedEnv

SeedEnv is a production-grade dark-mode marketplace connecting indie app developers with paid early-access beta testers.

## Stack

- Next.js App Router with Server Actions and Route Handlers
- TypeScript strict mode
- PostgreSQL + Prisma ORM
- Tailwind CSS with SeedEnv obsidian, royal purple, and gold tokens
- Radix primitives, Lucide icons, Framer Motion, canvas-confetti
- Stripe Checkout / Connect-ready escrow flow
- Supabase Storage-compatible proof screenshot uploads

## Local Setup

```bash
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

Open `https://seedenv.com` in production or your local development URL while running `npm run dev`.

## Install on Mobile

SeedEnv is configured as an installable web app. Installed sessions open at `/dashboard`; unauthenticated users are routed to sign in first.

On iPhone:

1. Open `https://seedenv.com` in Safari.
2. Tap the Share button.
3. Tap **Add to Home Screen**.
4. Confirm the name `SeedEnv`.

On Android:

1. Open `https://seedenv.com` in Chrome.
2. Tap the menu button.
3. Tap **Add to Home screen** or **Install app**.

## Required Production Environment

- `DATABASE_URL`: PostgreSQL connection string.
- `NEXT_PUBLIC_APP_URL`: public app URL for Stripe redirects, usually `https://seedenv.com`.
- `NEXTAUTH_URL`: canonical auth URL if NextAuth is enabled, usually `https://seedenv.com`.
- `NEXTAUTH_SECRET`: random secret generated with `openssl rand -base64 32`.
- `RESEND_API_KEY`: Resend key used for SeedEnv magic-link email authentication from a verified sender on `seedenv.com`.
- `AUTH_EMAIL_FROM`: verified Resend sender, for example `SeedEnv Authentication <auth@seedenv.com>`.
- `GITHUB_ID`, `GITHUB_SECRET`: GitHub OAuth app credentials for the sign-in page. Configure the GitHub callback URL as `https://seedenv.com/api/auth/callback/github`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth app credentials for the sign-in page. Configure the Google callback URL as `https://seedenv.com/api/auth/callback/google`.
- `STRIPE_SECRET_KEY`: Stripe secret key for escrow checkout.
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret for `/api/stripe/webhook`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROOF_BUCKET`: proof screenshot storage.

## Production Security Operations

- After deploying the private-proof storage code, set the `proof-screenshots` bucket to **private** in Supabase Storage. Uploads now store object paths, and the authenticated developer console and asset export issue five-minute signed links for new and existing Supabase proof records. Test preview and ZIP download before accepting more submissions. Existing public links cannot be revoked by code alone while the bucket stays public. Keep the service-role key server-only, and rotate it if it has ever been exposed.
- Turn on multi-factor authentication for every owner/staff account at GitHub, Render, the domain registrar/DNS provider, Stripe, Supabase, Resend, and Google Cloud (if used). Restrict repository, database, and payment access to named people with the least privileges. These switches must be enabled in the providers' dashboards.
- Configure automated **PostgreSQL backups** with your database provider (or an encrypted scheduled `pg_dump` stored off-site). Verify an actual restore to a separate database at least monthly. Also back up Supabase Storage objects separately; a database backup does not include proof files. Never put backups or secrets in Git.
- Enable GitHub Dependabot security alerts and review its weekly dependency PRs. Run `npm audit --omit=dev` regularly. As of September 2026, NextAuth v4's Nodemailer 7 peer dependency has reported high-severity advisories; do not force Nodemailer 10 until the authentication integration is tested against a compatible NextAuth version. Monitor advisories and plan that upgrade.

## Core Flows

- Developers create campaigns in `ESCROW_PENDING`. The developer charge is the tester payout pool divided by 0.92 (an 8% share of the total charge). Signed Checkout completion retrieves the Stripe session and verifies settled USD amount, developer ownership, and the exact pending ledger before activation. Duplicate events cannot reactivate paused or completed campaigns. Subscribe `/api/stripe/webhook` to `checkout.session.completed` and `checkout.session.async_payment_succeeded`; unsigned local payment simulations are no longer accepted.
- Testers apply to active missions, developers accept, and testers Start atomically to lock a slot for 30 minutes.
- Proof submission validates feedback and image signatures, computes SHA-256 server-side, rejects duplicate screenshots, uploads proof media, and leaves proof pending for review. The 8MB action body limit accommodates a base64-encoded 5MB screenshot plus bounded feedback and telemetry; image size remains limited to 5MB.
- A developer revision request preserves submitted evidence. The tester chooses Start revision to begin a fresh 30-minute editing window, can reuse or replace the screenshot, and retains feedback and telemetry. Resuming a live window does not reset its timer; an expired editing window can be restarted without consuming another slot or pass. Approval is blocked until revised proof is submitted. Apply the additive `20261004_submission_revisions` migration before running this release.
- Approvals award REP and Quest XP, update rank tier, and create a pending bounty ledger entry. Only a successful Stripe transfer completes the ledger and credits the tester wallet; failed/unconfigured transfers remain visibly pending.
- Rejections return the claimed slot to the public pool.
- `/api/cron/expire-slots` expires abandoned 30-minute locks.
- `/api/assets/download?campaignId=...` exports approved proof media and a manifest as a zip.
- Render runs `npm run seed:goddesses-beta` during startup after migrations, creating or updating the active Goddesses TestFlight validation mission from the production `DATABASE_URL`.

## Notes

### Tester Console

The tester dashboard has four separate, bookmarkable views on both desktop and phones: `/dashboard?view=discover` for mission search and opportunities, `view=missions` for resumable work, revisions, reviews and activity, `view=reputation` for REP, milestones and rewards, and `view=leaderboard` for community rankings. Only the selected view is rendered; navigation changes screens instead of jumping down one long page. Mobile navigation also includes Settings. Existing `?claim=...` links open My missions and start or resume the accepted mission there. Workspace switching remains available in Account settings.

Account profile grids use a single shrinkable column on phones so developer previews and form fields cannot force a wider page; the existing desktop two-column layout is unchanged.

Reputation (REP) uses the existing `xpPoints` balance: each approved mission earns `max(75, round(payout dollars * 32))` points. Rank thresholds are Alpha Seeder at 0, Core Validator at 1,500, and Apex Architect at 6,000. Milestones reflect actual approved missions and reputation; they do not award extra points. Approval rate counts approved and rejected developer reviews only. Lifetime earnings count approved mission rewards, while awaiting-payout totals come from pending bounty ledger transactions. No streak multipliers or random bonuses are promised.

Run `npm run test:tester` to check discovery filters, reward sorting, reputation thresholds, approval rates, and milestones.

Run `npm run test:launch` for revision and campaign-payment regressions. Set `RUN_LAUNCH_DB_TESTS=1` to exercise actual Server Actions, daily-credit idempotency, revision ownership/window/evidence preservation, payout-pending behavior, and settled/duplicate/stale payment events in an intentionally rolled-back transaction. Storage, notifications, and Stripe are mocked; tests send no money, emails, or provider uploads.

On phones below 640px, account settings use a two-column section picker and stacked workspace-button labels/statuses. Tester and developer screens provide persistent bottom navigation with safe-area spacing; forms use 16px text to avoid automatic iOS input zoom. The tester welcome area is compact on phones. Desktop placements are unchanged, apart from the workspace-button overlap fix.

### Quests, applications, and Launch Circle

- `/quests` contains the separate Quest XP wallet, unlimited lifetime levels (300 earned XP per level), 12 repeatable academy exercises (10 XP each per UTC day), and an always-open exchange. Opening the authenticated Tester Console awards 5 daily XP automatically; approved missions award 25 additional Quest XP. All credits have unique ledger keys. Spending XP never changes REP or lifetime level.
- The initial exchange offers a repeatable Discovery Pass for 300 XP and permanent selectable violet/emerald Quest Center accents for 100/150 XP. More reward types can be added later; passes do not guarantee mission availability or acceptance.
- Referral links carry `ref` through signup. A new member may attach one code within seven days of joining and before their first approved task. No self or reciprocal referrals. Email verification and at least one approved task are required. Each qualifying referral gives the inviter 200 XP plus one pass and the friend 100 XP; rewards are capped at three per inviter per UTC month. Excess qualified candidates remain pending and are reconsidered when the friend visits Quest Center or the Tester Console. OAuth alone does not verify a referral email; use email access verification.
- Developers configure minimum REP per task during campaign creation or in `/applications`. A mission bundles all its instruction steps, so requesting entry requires the highest task threshold. A developer can allow a Discovery Pass exception with a separate minimum REP floor. Passes bypass only this REP threshold; developers must still assess devices and all other requirements.
- Applications follow pending, accepted, and started states. Acceptance reserves capacity for at most 24 hours (or campaign expiry, whichever is earlier); the existing 30-minute proof timer begins on Start. Reserved passes are returned on decline, withdrawal, or unstarted acceptance expiry, and consumed on Start. Existing pending submissions remain resumable. Withdrawn/declined applications and rejected/expired work can be reapplied for; starting a fresh attempt clears its old proof and review details. The existing slot-expiry cron also releases expired accepted applications.
- `/community` is the members-only Launch Circle: developers publish app updates, members comment, and authors/moderators remove content. Members can report posts and comments; admins see the moderation queue on the same page. Posts are limited to five per rolling 24 hours, comments to 20 per rolling hour, and reports to 20 per rolling day. Feeds and discussions are paginated, text is rendered without HTML, and community activity awards no points.
- The campaign builder includes 24 reusable micro-task briefs. These are mission steps, not independent reward claims; REP retains the existing bounty-based approval formula to avoid double-crediting old campaigns. Separate task payouts, the full proposed 62-quest catalog, and additional specialty rewards are not part of this initial release.

Apply migrations with `npx prisma migrate deploy` before running this release. Render startup now stops if migration deployment fails rather than starting against a missing schema. The additive `20261003_quests_applications_community` migration preserves existing REP, users, and submissions.

Run `npm run test:quests` for quest policy tests. The PostgreSQL integration test is skipped by default; set `RUN_QUEST_DB_TESTS=1` to exercise ledger idempotency, referral caps, exchange spending, pass reservation/refunds, developer ownership, and application acceptance against the configured database. Its fixtures live inside an intentionally rolled-back transaction; it sends no email and creates no real payouts.

## Clippers creator workspace

`/clippers` is a separate, authenticated creator-collaboration workspace linked from both consoles. It does not award tester REP or Quest XP and does not use Discovery Passes. Creators keep ownership; the paid agreement grants 90 days of organic repost rights from transfer completion. Paid ads, boosting, whitelisting, raw footage, and ownership transfer are excluded. Have counsel review these marketplace terms and Stripe's supported business/funds-holding model before commercial launch; the feature is not described as legal escrow.

Developers create immutable briefs with a fixed fee ($10-$1,000 USD), platform (TikTok, Instagram, YouTube), REP threshold, 0-5 included revision rounds, 3-30-day initial draft deadline, and 7-90-day public-post retention term. The total developer charge is the creator fee divided by 0.92, rounded up to whole cents. Creators need a verified email, complete background/sample links, and adequate REP to apply; payout setup must be complete before funding. Social URLs are self-reported unless separately connected and verified. Developer acceptance opens an invited group room, but creators must wait for a signed Stripe webhook to confirm funding before uploading work.

Private rooms refresh every 15 seconds while visible, with 50-message cursor pages. Messages and developer reference images/videos are shared with invited participants; each creator's draft versions, publication evidence, and contract review remain private to that creator, the developer, and administrators. Message and upload rate limits are enforced server-side. Images are limited to 10MB; MP4, MOV, and WebM videos to 50MB to accommodate the current storage plan. Signed direct-to-storage uploads avoid routing video bodies through Next server actions. File sizes, MIME declarations, and leading signatures are checked before completion. This is not a malware scanner or a video transcoder.

The workflow is application -> acceptance -> pre-funding -> video draft -> bounded revision/approval -> public post and screenshot evidence -> verification -> developer release -> Stripe transfer. Developers have 72 hours to review/release after submission, requested revisions are due within three days, and publication within seven days of draft approval. These are visible contractual deadlines, not automated payment forfeitures. Evidence is versioned, and the approved version is pinned. Native private-review overlays are **not** burned-in watermarks or copy protection; clean final videos are published by creators without a SeedEnv watermark.

Publication URLs must use the campaign's platform and full video-post URL. TikTok's official `video/query` endpoint verifies the selected video belongs to the connected creator and checks its creation time and unique agreement caption code. This does not prove the posted video's visual contents match the approved draft or guarantee permanent availability: the developer must still review the real post, disclosure, and content match before releasing funds. Instagram/YouTube verification is manual and explicitly labeled; TikTok manual review is also available. No content is automatically posted. TikTok Content Posting API is intentionally not requested: it requires a separate audit and additional consent/disclosure UX.

Either party can dispute funded or paid work. Disputes freeze unreleased work/funds; they do not reverse money already transferred. `/clippers` in the ADMIN workspace lists disputes and interrupted payouts/refunds. An administrator can record a decision and resume an agreement or refund funding that has not entered payout. Developer cancellation/refund is only allowed before draft upload starts. Payout retries reconcile the same transfer using both Stripe idempotency keys and the transfer group; refund retries reconcile existing refunds. Charge disputes/refunds require Stripe reconciliation and are not silently dismissed. Dedicated `CLIPPER_*` ledger entries keep these transfers out of ordinary tester-payout automation.

### Configuration and launch gates

Apply `20261003_clippers` with `npx prisma migrate deploy`. Set `CLIPPERS_ENABLED=true` only after configuring storage, signed payment webhooks, and real administrator dispute coverage. With the flag off, the entry page shows a preparation notice and all mutations are blocked. Database migration alone does not activate payment or social integrations.

- Use a **private** Supabase bucket identified by `SUPABASE_CLIPPERS_BUCKET` (default `seedenv-clippers`). `npm run setup:clippers-storage` creates only this bucket if missing, with a 50MB file limit and supported MIME restrictions, and never modifies existing buckets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are server-only; public or unbounded buckets are rejected. Do not enable public read/list policies. Client signed upload URLs are scoped to a single random path, never upsert. Funding is blocked until private storage and the dedicated signed payment webhook are configured. Storage should expire abandoned, incomplete upload objects through an operator-managed retention job; completed evidence must remain available for disputes and legal recordkeeping.
- Stripe: use the existing `STRIPE_SECRET_KEY` and connected creator accounts with active transfer capability and payouts enabled. Set a public HTTPS `NEXT_PUBLIC_APP_URL`. Add a **separate signed webhook** at `/api/clippers/stripe-webhook`, with its signing secret in `CLIPPERS_STRIPE_WEBHOOK_SECRET`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.dispute.created`, and `charge.refunded`. Never send unsigned development payment simulations to this endpoint.
- TikTok: obtain approved Login Kit and Display API access with `user.info.basic,video.list`. Set `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and `TIKTOK_REDIRECT_URI=https://seedenv.com/api/clippers/tiktok/callback` (register that exact static callback in TikTok). Set `CLIPPERS_TOKEN_KEY` to a dedicated, securely generated 32-byte base64 encryption key; store it only in your environment/secret manager and preserve it across deployments. Rotating it without re-encrypting tokens requires creators to reconnect.
- OAuth routes: `/api/clippers/tiktok/connect` and `/api/clippers/tiktok/callback`; state is random, hashed in the database, session-bound, cookie-checked, time-limited, and consumed once. Partial profile/video scope grants are rejected; encrypted tokens are refreshed and can be revoked. Provider account identifiers cannot be shared by different SeedEnv users.

Run `npm run test:clippers` for rules (database suites skip by default). Set `RUN_CLIPPER_DB_TESTS=1` for rollback-only lifecycle, mocked-payment, and mocked-TikTok integration tests. Payment tests mock every Stripe call, including lost-transfer-response reconciliation and repeated refunds; they neither charge cards nor send real transfers. TikTok tests cover scope denial, encrypted token refresh, unique account ownership, posting time/caption checks, and revocation without external provider calls. Set `RUN_CLIPPER_STORAGE_TESTS=1` to exercise real signed Supabase image uploads, deny teammate access to private evidence, reject invalid signatures, and verify upload tokens cannot overwrite. Storage fixtures are deleted individually and database fixtures rolled back. The test runner uses Node 22's experimental module mocking only in tests. Real Stripe test-mode webhook/destination testing and an approved TikTok connection must still be exercised before commercial activation. No production credentials, external provider approval, or live publication are fabricated.

The dashboard shows up to 50 campaigns and 100 agreements; the admin queue and room roster show up to 100 entries. Shared assets and draft history are capped at 100 displayed files. This release does not include WebSocket chat, burned-in watermarks, automatic cross-platform publishing, automatic post-retention policing, paid-ad licensing, or automatic dispute adjudication.

SeedEnv uses NextAuth email magic links through Resend. The current preview fallback still uses seeded SeedEnv users when no session is present; set `SEEDENV_PREVIEW_USER_ID` to force a specific preview identity. Clippers always uses real authenticated membership, never that preview fallback.

## Render Environment

Render does not receive local `.env` values. Set these in the Render dashboard before relying on protected routes:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL=https://seedenv.com`
- `NEXTAUTH_URL=https://seedenv.com`
- `NEXTAUTH_SECRET`
- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM=SeedEnv Authentication <auth@seedenv.com>`
- `GITHUB_ID` and `GITHUB_SECRET` from a GitHub OAuth app with callback URL `https://seedenv.com/api/auth/callback/github`.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from a Google OAuth client with callback URL `https://seedenv.com/api/auth/callback/google`.
- `SUPABASE_PROOF_BUCKET=proof-screenshots`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- `CRON_SECRET`
- `NEXT_PUBLIC_TERIMUS_URL` — the exact TERIMUS LLC landing-page URL used by the public footer.
- `SEEDENV_ANALYTICS_OWNER_EMAIL` — the exact owner email allowed to view site analytics in the developer console. Analytics is hidden when this is unset.

If `NEXTAUTH_SECRET` is missing, NextAuth will return `NO_SECRET` and protected routes will fail in production.

Check `/api/system/email-health` after deployment to verify auth email configuration without exposing secret values.
