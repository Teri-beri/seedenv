# SeedEnv

SeedEnv is a production-grade dark-mode marketplace connecting indie app developers with paid early-access beta testers.

## Profiles, follows and private messages

- Apply `20261022_social_connections` before starting this release. Landing/Explore/profile cohort links open `/cohorts/[id]` with the current public brief, logo, steps and a landing-page back link. Private installation URLs, financial records and proof uploads are not exposed.
- Developer and tester handles use the same public profile route. Stats are lifetime counts, not the recent eight-item account preview. Approval rates exclude pending denial reviews. Profile activity respects Launch Circle visibility and hidden content.
- Account settings expose Messages, Message privacy and Connections in both workspaces. One canonical conversation exists per account pair. New contacts get one request message, then must wait for acceptance; only the recipient can accept/decline. Declined requests cannot be resent. Blocks disable messages/follows in both directions, remove follows and cancel queued emails. Unblocking does not reopen a declined conversation. Requests are capped at 10/day; messages at 60/hour. Messages are plain text, up to 2,000 characters. Conversation history and connection lists are paginated.
- The inbox refreshes every 20 seconds while visible and when returning to the tab, without resetting a composed message. Hidden tabs do not poll; a manual refresh control is available.
- Follows are available to signed-in members. Developer-update emails are explicitly opt-in per follow and require a verified recipient email. Tester follows never send emails. Members-only post emails contain a generic notification/link, not the private post body. Unfollow/disable/block cancels pending deliveries. Reported messages share a clearly disclosed recent excerpt with the existing private support queue.
- Launch Circle's Following filter shows updates from followed developers; profile activity includes visible posts and replies with links to full conversations.
- Follower emails are written atomically with a new cohort's activation (all funding paths) or Launch Circle publication. Existing cohorts/posts are not backfilled. A unique event/recipient key prevents duplicate webhook fan-out.
- `.github/workflows/follower-emails.yml` schedules authenticated `POST /api/cron/follower-emails` every five minutes, using the same `SEEDENV_CRON_SECRET` repository secret as the slot-expiration workflow. Delivery requires `RESEND_API_KEY` and `AUTH_EMAIL_FROM`, processes 30 queued emails/run, uses provider idempotency and retries failures up to eight times with logged errors. Failed/exhausted records retain `lastError` for operator investigation. No browser traffic or paid Render cron job is required. GitHub schedules can be delayed; this is not an instant-email guarantee.
- Test with `node --conditions=react-server --experimental-test-module-mocks --import tsx --test scripts/social-connections.test.ts`. Set `RUN_SOCIAL_DB_TESTS=1` only on the guarded sandbox database for real request, block, follow and queued-email lifecycle tests; email providers are mocked.

## Cohort brief clicks and bundle pricing

- Apply `20261023_cohort_clicks` before starting this release. Public brief links on Landing, Explore and member profiles record a click only on interaction, never on prefetch or rendering. Developer Active Cohorts shows the private aggregate badge. The cohort owner is excluded when signed in; bots, local previews, opted-out and configured excluded-IP traffic are ignored. Counts deduplicate each cohort/visitor per UTC day and start with this release. Signed-in IDs and anonymous IP/user-agent combinations are hashed with a daily key; raw identifiers are not stored. Anonymous owners cannot be identified as owners.
- The live cohort board is directly after the hero's conditional platform-fee offer, before the showcase and developer workflow. Owners see a link to `/console#active-cohorts`, including when their cohort is full.
- New bundles use the shared 20% platform-fee calculation with a $15 minimum: Google Play $80 rewards + $16 fee = $96; Flash $175 rewards + $35 fee = $210. Discounts/waivers reduce fees only. No migration rewrites financial records: paid/pending checkout settlement, receipts and refunds continue using persisted campaign amounts. A new checkout uses the current price.
- Run `node --conditions=react-server --experimental-test-module-mocks --import tsx --test scripts/cohort-clicks.test.ts` for recording gates, new pricing and legacy checkout/refund preservation. `RUN_COHORT_CLICK_DB_TESTS=1` additionally verifies real PostgreSQL concurrent deduplication, per-day keys, owner-console counts and cascading deletion, only on the guarded sandbox.

## Resilient developer fee benefits

- Apply `20261024_resilient_referral_credits` and `20261025_referral_checkout_lifecycle` before starting this release. They do not rewrite paid or pending cohort amounts or previously issued codes. The graph migration stops on historical referral cycles for operator review. Use `prisma migrate deploy` on baselined deployments; never reset a shared or production database.
- A verified developer can share an inviter code. One inviter is permanently attached before the referee's first funded cohort; PostgreSQL triggers and serializable application transactions reject self, reciprocal and longer cycles, including direct database writes.
- The first funded cohort receives a one-time 100% servicing-fee waiver, with a per-account reservation preventing simultaneous-tab reuse. Funded cancellations, refunds and withdrawals do not reset it. Tester compensation is never discounted. The existing 20% servicing fee / $15 cohort minimum remains the base policy.
- Future referral credits require at least $50 in **actual tester escrow**, excluding servicing fees and balance top-ups. One credit per distinct referred developer is created `PENDING`. Actual tester starts/submissions, not accepted applications or mutable slot counters, must reach at least half the source cohort before vesting. Cancellation alone sets `COMPLETED` in the existing lifecycle and never satisfies vesting.
- Vested credits expire 90 days after vesting and apply automatically, earliest expiry first. Each cuts the remaining fee by 50%; new credit stacks stop at 75%. At most two credits are reserved; extra credits remain unused. First-cohort/permanent waivers and manual promos of at least 75% do not consume new credits. Previously issued non-expiring legacy codes retain their up-to-100% stacking terms.
- Source cancellations, refunds and disputes revoke pending, vested and redeemed credits. Actual redeemed servicing-fee savings are recovered from the developer funding balance, never tester wallets or rewards. Recoveries are replay-safe, can create funding debt, and appear in the private `/admin/referrals` audit. Later funding against an already-revoked reservation also recovers its incremental savings.
- Prepaid checkout isolates tester rewards and servicing fees as separate Stripe line items and binds settlement to its durable ledger attempt. Confirmed expired, unpaid sessions release unfunded benefits; paid sessions consume them once. Unknown Stripe outcomes retain reservations and surface an operator-reconciliation error, never silently release money or discounts. The authenticated slot-expiry cron settles abandoned checkouts/top-ups, expires vouchers and fairly rotates pending milestone checks.
- Any genuine TestFlight join URL is normalized and registered on the first saved cohort or launch, regardless of the selected platform. The same join token remains restricted to its original developer. Query strings, fragments and trailing slashes do not evade the binding. **This verifies SeedEnv link registration, not Apple app ownership**: regenerated join tokens cannot be linked to the same underlying app without an additional Apple ownership-verification integration. Verified ownership transfers require support intervention.
- Checkout shows tester escrow, discounted servicing fees and $0 processing charged. SeedEnv still absorbs processing: a blanket 2.9% + $0.30 surcharge is **not enabled**. Stripe's current [credit-card surcharging policy](https://docs.stripe.com/payments/cards/surcharge) excludes debit/prepaid cards, caps U.S. credit surcharges at 3%, requires merchant/network notices and customer disclosures, and uses a preview integration. Merchant/acquirer approval and a compliant integration must precede enabling pass-through charges.
- Run `node --conditions=react-server --experimental-test-module-mocks --import tsx --test scripts/resilient-referrals.test.ts scripts/cohort-promos.test.ts` for focused regressions. For real PostgreSQL graph, funding, milestone, concurrent reservation, expiration and clawback tests, set `RUN_RESILIENT_REFERRAL_DB_TESTS=1` / `RUN_COHORT_PROMO_DB_TESTS=1` only against the guarded `seedenv_staging_db`; all payment/email providers are mocked and named fixtures are cleaned.

## Cohort instruction versions

- Apply `20261021_instruction_versions` before running this release. It archives non-draft cohorts' current directions and anchors existing accepted applications and submissions to that baseline; it cannot reconstruct pre-migration edits.
- Active cohort owners can edit only existing step titles/details from Console → Edit directions. Step IDs/order, proof types, REP floors, funding and rewards are not changed by this action. Stale revisions are rejected; saves and both prepaid/balance-funded acceptances use serializable transactions.
- Each acceptance pins an immutable `CohortInstructionVersion`; starting copies that version ID to the submission. Revisions retain it. New applications reset the previous assignment link and use the current version on acceptance.
- Tester dashboards/workspaces show pinned directions and an update notice when a newer version exists. Developer review, automated QA and the manual denial queue use assigned directions, not current tasks. Owners and operators can view the complete version history.
- Run focused tests with `node --conditions=react-server --experimental-test-module-mocks --import tsx --test scripts/instruction-versions.test.ts`. Set `RUN_INSTRUCTION_VERSION_DB_TESTS=1` only against the guarded sandbox database to exercise real PostgreSQL transactions; Stripe and email remain mocked.

## Stack

Tester join requests are separate from submitted-proof reviews. The developer console shows the pending request count and links to `/applications#tester-requests`; the desktop header also links to Tester requests. The application center lists pending requests before history and keeps eligibility configuration collapsed below the queue. Join actions return explicit success/error results so expected denials (own cohort, duplicate application, REP/pass requirements) are readable in production; unexpected failures are logged and never shown as success. The public cohort directory sits immediately after the conditional promotional offer.

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
- Billing reconciliation requires migration `20261013_billing_reconciliation` before deploying this code. Subscribe the signed Stripe webhook to checkout success events plus `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, and `charge.dispute.created`, `.updated`, `.closed`, `.funds_withdrawn`, `.funds_reinstated`. Reconciliation retrieves authoritative Stripe state, so replayed/out-of-order events do not restore reversed funds. No additional secret is needed.
- Refunded/disputed balance funding is removed exactly once; a negative prepaid balance is funding debt, not usable credit. Top-ups and unused-slot returns repay it before pay-per-tester payouts resume. Prepaid escrow reversals hold that cohort's payouts; Billing shows the missing backing and lets its owner replace it from prepaid balance. Won disputes restore backing once (including returning replacement funds where applicable). Already-sent tester payouts are not silently clawed back: the developer retains the funding debt.
- Card refunds and tester transfers reserve durable `billing_operations` identities before Stripe mutations, with immutable amounts/destinations and provenance. Retries discover remote refunds by operation metadata and transfers by stable transfer group, including paginated results. Unknown outcomes keep only that operation reserved; never credit ambiguous refunds back into spendable balance. Use “Reconcile pending refund” in Billing or retry Cash Out. Beyond 23 hours, an existing remote object can be settled, but an absent/unknown result is **not** recreated with an expired idempotency key. Support must verify the remote outcome before any manual repair; do not delete operation identities or reset `firstAttemptAt`. Stripe-confirmed failed/cancelled refunds release reservations exactly once; rejected/unknown API responses do not prove that an overlapping request did not succeed.
- Existing pending tester payouts are migrated as `LEGACY_PAYOUT`: reconciliation scans Stripe's original ledger metadata before settlement; if no transfer can be proven, support must resolve the pre-migration unknown outcome. Legacy balances without exact card-to-slot provenance are conservatively held while the developer has funding debt. These targeted holds clear by replacing backing; unrelated funded developers continue normally. Deterministic billing security tests use only in-memory databases and Stripe doubles: `node --experimental-test-module-mocks --import tsx --test scripts/slot-funding.test.ts scripts/billing-security.test.ts`.
- Stripe-reading billing transactions explicitly use serializable isolation, a 5-second acquisition wait, and a 120-second transaction timeout (`lib/billing-transaction.ts`), instead of Prisma's default 5-second interactive timeout. A slow/paginated reconciliation fails visibly and rolls accounting back; Stripe mutations are outside these transactions and retain their durable reservations. Alert on repeated timeouts; do not skip remote pages or apply partial accounting.

#### Billing support repair runbook

There is no automatic “assume not sent” admin/CLI command. A successful empty Stripe list alone does not authorize recreating an expired/legacy operation. Only trained billing operators should perform the following repair using the correct Stripe account and live/test mode; record the operation ID, Stripe request/response IDs, support case, operator, evidence, and decision in the incident ticket.

1. Read the immutable `billing_operations` row and its wallet ledger. Never delete it, change its amount/destination, reset `firstAttemptAt`, or mark the ledger completed manually. Check funding holds/debt and that a refund's balance/card reservation remains intact.
2. Search **all pages** of Stripe transfers by `transfer_group = operation.id` (legacy: all transfers by `metadata.seedenvLedgerTransactionId = operation.ledgerId`) or refunds by `payment_intent = operation.paymentId` and `metadata.seedenvOperationId = operation.id`. Check Stripe request logs and obtain Stripe support confirmation for an unresolved/lost request. More than one matching object, a reversed transfer, mismatched amount/currency/destination/payment, or an unresolved processing request must stay held for investigation.
3. If an existing matching object is found, optionally attach its ID in an operator database transaction (bind the two values; this is **not** an accounting settlement):

   ```sql
   BEGIN;
   SELECT * FROM billing_operations WHERE id = $1 FOR UPDATE;
   UPDATE billing_operations SET "remoteId" = $2, "updatedAt" = CURRENT_TIMESTAMP
     WHERE id = $1 AND state IN ('RESERVED', 'SUBMITTED', 'FAILED')
       AND ("remoteId" IS NULL OR "remoteId" = $2);
   COMMIT;
   ```

   Require exactly one update, and validate the remote object before attachment. Existing-object reconciliation is allowed beyond 23 hours. The normal routine revalidates the remote object and settles the ledger/wallet exactly once:
   - Tester transfer: tester retries Cash Out, or an authorized server-side operator calls `transferTesterPayout(operation.userId, operation.ledgerId)`.
   - Balance refund: owner chooses “Reconcile pending refund”, or operator calls `withdrawBalance(operation.userId)`.
   - Slot/prepaid refund: operator calls `reconcileCampaignFunding(operation.campaignId)`. Failed/cancelled Stripe refunds release the reservation without pretending they succeeded.
4. **Only if Stripe support definitively confirms no object and no request can still complete**, schedule a maintenance window: stop incoming billing requests/webhooks and drain/stop all billing workers so an old in-flight request cannot overlap repair. Independently verify the funding backing and original reservation; for a legacy payout reconstruct its approved submission/campaign association and destination from evidence. Do not release money if backing/provenance cannot be established.
5. An authorized operator may then create **one** remote object through Stripe's API, with the original immutable parameters and a recorded, unique manual-repair idempotency key. Transfer: `amount = amountCents`, `currency = usd`, `destination = destinationId`, `transfer_group = operation.id`, metadata `seedenvOperationId = operation.id`, `seedenvLedgerTransactionId = ledgerId`, `seedenvUserId = userId`. Refund: `payment_intent = paymentId`, `amount = amountCents`, metadata `seedenvOperationId = operation.id`. Never replay this creation with a fresh key if its response is lost; investigate that request instead. Attach the returned ID using step 3 and run normal reconciliation; restore workers/webhooks only after verification. This explicit operator-authorized remote creation (not resetting a local retry clock) is also the repair for legacy payouts with proven absent transfers.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROOF_BUCKET`: proof screenshot storage.
- `GEMINI_API_KEY` (optional): enables the "Ask AI" tab in the help drawer (`?`). Use a Google AI Studio key from a project with billing enabled (paid tier) so chat content is not used for training. Without it, only the human support form is shown. The assistant answers from the FAQ and pricing constants and has read-only, session-scoped tools for the member's account, cohorts, testing work and payments; it cannot change data and hands off to the ticket form.
- `GEMINI_SUPPORT_MODEL` (optional, default `gemini-3.1-flash-lite`) and `SUPPORT_AI_DAILY_LIMIT` (optional, default `1500` assistant requests per day per server instance).
- QA assistant (uses `GEMINI_API_KEY`; optional `GEMINI_QA_TEXT_MODEL`, `GEMINI_QA_VISION_MODEL`, `QA_AI_DAILY_LIMIT`, `SEEDENV_DISABLE_QA_AI=1`). Four agents in `lib/ai/agents/`, all advisory:
  - **Intake auditor**: runs after every proof submission (`after()` in `submitTaskProof`). It scores the report from 1 to 10, lists missing details and flags likely duplicates. For clearly incomplete reports (score ≤4) it sends the tester **one** automatic revision request.
  - **Fraud watchdog**: checks the screenshot, and any stored recording up to 18 MB, against the report with Gemini vision. Copied text and emulator signals also count. A risk score of 70 or more pauses the 48-hour auto-approval until an admin clears it at `/admin/qa` or the developer decides.
  - **Spec architect**: powers "Draft this cohort with AI" in step 1 of the new-cohort wizard (`POST /api/agent/generate-spec`).
  - **Release synthesis**: groups the approved reports for a cohort into P0/P1/P2 issues when the cohort ends. Developers see these as Release reports in the console overview, with copyable GitHub markdown (`POST /api/agent/synthesize-campaign`).
  - **Failures**: if Gemini fails, the audit is saved as `PENDING` and an alert goes to the Slack, Discord or Telegram webhooks. The audit is retried every 10 minutes (up to 5 attempts) and appears in `/admin/qa`. Re-run a single audit with `POST /api/agent/audit-submission` (as the developer or an admin, or with `Authorization: Bearer $CRON_SECRET`). Tests: `scripts/qa-agents.test.ts`.

## Production Security Operations

### Launch wizard autosave

The launch wizard privately autosaves incomplete details, tasks, budget settings, wizard progress, uploaded icon URLs, and AI drafting inputs to the signed-in account after 700ms of inactivity. Open New Drop again to resume across devices. Saved campaign drafts have their own recovery entries; saving does not publish a campaign, reserve funds, or contact Stripe. Original icon files are not retained until upload succeeds.

`User.launchWizardDrafts` stores versioned, validated draft data; `launchWizardDraftRevision` prevents stale tabs/devices from overwriting newer work. The UI reports conflicts and save failures rather than claiming success. A user-scoped browser recovery copy protects edits while account saving is pending; wait for “Saved to your account” before moving to another device. Use “Discard saved work” to reset. Successfully created campaigns clear the wizard entry; historical campaigns and billing are unchanged.

### Developer platform fee waivers

`User.platformFeeWaived` is a server-managed, persistent account entitlement (default `false`). The `20261015_owner_platform_fee_waiver` migration grants it once to the verified owner account by immutable user ID and checks the email before granting; changing an email or sending a client flag cannot acquire a waiver. Do not expose this field in profile/settings actions.

Waived accounts pay only tester rewards on future custom slot reservations and new bundle checkouts, and only creator rewards on new Clippers agreements. Quotes, launch thresholds, escrow records, Checkout descriptions, and invoice snapshots use the same zero-fee policy. Public prices and other accounts are unchanged. Previously funded slots, paid bundles, and existing creator agreements keep their original terms; no historical fees or balances are rewritten. Stripe processing costs remain borne by SeedEnv, and tax gates are unchanged.

### Cohort promo codes

The Budget step accepts configurable 1-100% platform-fee discounts for custom cohorts and bundles, including the custom minimum fee. Tester rewards, balance top-ups, and Clippers are not discounted. Permanent account waivers take precedence and cannot stack with codes. Normal prices are unchanged.

The verified owner and administrators manage codes at `/admin/promos` (also linked from the owner console and admin dashboard). Every management action verifies authorization. Set an expiry and total redemption cap; disable codes to stop new reservations. The launch-offers migration creates FIRSTDROP and BUILD50 as described below; other public offers require operator creation. Discounts and reservations are server-validated and stored with the campaign, not trusted from client quotes or autosave data.

Each code is usable for one paid cohort per developer. Launching atomically reserves a place under the cap. A successful launch-linked top-up, bundle payment, or first balance-funded tester debit marks it used; failed payments do not. An unpaid reservation can move to another cohort without using another place under the cap. Before retrying or moving, the server closes the previous unpaid Stripe Checkout; completed/uncertain payments block reuse pending confirmation or reconciliation. Moving returns the old cohort to an undiscounted draft. Existing reserved/paid cohort terms survive code expiry or disablement, but transfers to another cohort require the code to remain valid. Reservations count toward capacity even while unpaid; refunds do not restore a consumed code.

Apply `20261017_cohort_promo_codes` through `prisma migrate deploy` before startup. Run `scripts/cohort-promos.test.ts` for pricing, access and guarded sandbox transaction/concurrency tests (`RUN_COHORT_PROMO_DB_TESTS=1` for database cases). Tests use isolated fixtures and mocked Stripe; no real payments are sent.

### Developer referrals and denied-proof review

`20261019_developer_referrals` introduced developer referrals separately from tester Quest referrals. Already-issued legacy codes retain their original non-expiring, up-to-100% stacking terms. New developer referrals follow the resilient policy below. Signup attaches the supplied code after authentication and workspace setup; failures redirect to account settings with the specific eligibility error.

One public promo plus a referral credit, or two owned referral credits, can stack additively up to 100%; combinations above 100% are rejected rather than wasting a credit. Reservations protect capacity and cannot move while a payment can still complete. Moving a stacked reservation returns the old cohort to an undiscounted draft and releases its other unpaid code reservation. Successful payments/debits consume the selected credits; historical receipts remain immutable.

`20261020_launch_promo_offers` creates FIRSTDROP (100%, 20 developers, 14 days) and BUILD50 (50%, 50 developers, 30 days) starting from migration deployment, without overwriting existing offers. Create partner-specific offers with their own agreed caps in the private promo manager. Legacy referral codes never expire; future fee credits expire 90 days after vesting.

The landing page promotes FIRSTDROP directly below the hero, before the validation showcase. The server displays the offer only while that public code is enabled, provides a full fee waiver, is unexpired, and has remaining reservation capacity. The card shows actual remaining capacity and expiry, provides a copy-code button, and routes developers into the launch wizard. It explicitly requires applying the code in Budget and fully funding tester rewards. Availability lookup failures are logged and hide the advertisement rather than advertising an unverified offer.

`20261018_denied_proof_review` changes new developer denials to provisional manual-review cases. The submission remains PENDING and its claimed place remains held, protecting its unpaid reward from payout, reuse, cancellation refund, and automatic approval. Proof editing/revision is blocked during the hold. The owner/admin queue at `/admin/proof-reviews` shows instructions, evidence and reasons. Only an authorized operator may approve work (normal payout flow) or confirm denial (release the unused place), with timestamp, reviewer ID, and findings recorded. Existing rejections and previously paid rewards are not rewritten. The tester console and Terms disclose instruction/evidence/duration standards, including 14-day requirements where stated. Have qualified legal counsel review the terms before commercial deployment.

Run `npm run test:cohort-promos` for pricing and signup referral tests. The integration case additionally covers paid qualification, duplicate webhooks, stacked-credit transfers, private-credit ownership, custom/bundle cancellation holds, and concurrent operator approvals. Enable it with `RUN_COHORT_PROMO_DB_TESTS=1` and the isolated sandbox `DATABASE_URL`; the hostname guard refuses production. Stripe and email are mocked and fixture records are removed afterward.

### SeedEnv stored-value and Florida service tax policy

Apply `20261014_tax_audit` after the pending billing-security migrations. This extends the existing authoritative `User.fundingBalanceCents`, `User.walletBalanceCents`, and `WalletTransaction` ledger; it does not create a competing Wallet table or rewrite historical balances. Nullable tax fields distinguish historical/unassessed entries from explicitly assessed zero-tax entries.

`SEEDENV_STRIPE_TAX_ENABLED=1` enables Stripe automatic tax and required billing-address collection for new credit Checkout sessions. Products use `txcd_00000000` (Stripe **Nontaxable**, not a dedicated gift-card classification); metadata identifies the `seedenv` business unit. Complete zero-tax assessment, settled payment, ownership, currency and amount are required before credit. Off-session stored-value reloads retain zero-tax stored-value policy records but are not represented as Stripe Tax calculations. The stale-payment recovery path validates Checkout tax too. Do not register a second webhook for the same events: `/api/webhooks/stripe` is an alias of the existing signed `/api/stripe/webhook`.

`SEEDENV_FLORIDA_QA_TAX_POLICY_CONFIRMED=1` explicitly approves the operator-supplied Florida policy; the software does not establish legal exemption. With tax integration enabled, launching services and consuming credits require a complete US/Florida billing profile; missing or non-Florida jurisdictions fail closed before purchases/debits, including reused slots. Storefront address is the sourcing evidence, not proof of physical location or nexus. Confirm sourcing/classification with a qualified tax adviser; this implementation does not interpret Fla. Admin. Code R. 12A-1.089 or certify that marketplace credits meet its definition.

QA and facilitation are classified as `txcd_20030000` (**General - Services**). Do not use `txcd_10102000` as a synonym for a marketplace: Stripe defines it as cloud Platform-as-a-Service for developing/running applications. Prepaid packages use the services code, not the stored-value code. Their payment callback validates the actual Checkout address against the policy approved at creation, requires a complete zero-tax calculation, and records Checkout sourcing in the receipt and campaign snapshot. Switching an operator flag off does not invalidate an already-authorized settlement; an address or assessment mismatch requires explicit reconciliation. New receipts show bounty, fee, zero collected tax, policy version and product tax code; historical receipts are not retroactively labeled exempt. Service purchases currently support only the approved zero-tax Florida policy, not arbitrary nonzero tax rates or international VAT.

Fees are reserved with the tester stipend at acceptance; payout creation must not deduct them again. The atomic approval flow reserves a pending payable and transfers only through durable security operations; a tester wallet is credited only after Stripe settlement. Partial/full refunds preserve original receipt tax evidence, and zero-tax refunds do not invent tax credits. Tax support does not replace tester 1099 reporting or LLC income-tax obligations.

Both flags default to `0`, preserving existing behavior without claiming a tax determination. Stage with the new SeedEnv Stripe account, configure its Stripe Tax business details/Florida registration, test $100/$500 top-ups, out-of-order/replayed webhooks, missing addresses, non-Florida purchases, package payments, refunds and interrupted payouts before enabling live flags. Existing payout obligations remain settleable from their original tax snapshot even if an address changes. This branch includes pending security changes and is not a standalone production deployment.

- Apply `20261009_session_revocation` before serving the updated authentication code (normal `npm start` runs migrations first). Sessions carry a database-backed version checked on every session read and protected-route request. Password changes and **Sign out all devices** increment it, invalidating all existing sessions, including the current one. Existing pre-upgrade sessions without a version are intentionally rejected; users must sign in again. Database failures fail closed instead of accepting an unverifiable session.
- After deploying the private-proof storage code, set the `proof-screenshots` bucket to **private** in Supabase Storage. Uploads now store object paths, and the authenticated developer console and asset export issue five-minute signed links for new and existing Supabase proof records. Test preview and ZIP download before accepting more submissions. Existing public links cannot be revoked by code alone while the bucket stays public. Keep the service-role key server-only, and rotate it if it has ever been exposed.
- Proof uploads and signed evidence URLs now fail closed if the proof bucket is public or its privacy cannot be verified. The avatar bucket must be separate from both proof and Clippers buckets so avatar setup cannot make evidence public. This guard does not retroactively hide files in a public bucket: verify the bucket's **private** setting in Supabase before deployment.
- Turn on multi-factor authentication for every owner/staff account at GitHub, Render, the domain registrar/DNS provider, Stripe, Supabase, Resend, and Google Cloud (if used). Restrict repository, database, and payment access to named people with the least privileges. These switches must be enabled in the providers' dashboards.
- Configure automated **PostgreSQL backups** with your database provider (or an encrypted scheduled `pg_dump` stored off-site). Verify an actual restore to a separate database at least monthly. Also back up Supabase Storage objects separately; a database backup does not include proof files. Never put backups or secrets in Git.
- Enable GitHub Dependabot security alerts and review its weekly dependency PRs. Run `npm audit --omit=dev` regularly. As of September 2026, NextAuth v4's Nodemailer 7 peer dependency has reported high-severity advisories; do not force Nodemailer 10 until the authentication integration is tested against a compatible NextAuth version. Monitor advisories and plan that upgrade.

## Core Flows

- Custom (`STANDARD_QA`) cohorts are `PAY_PER_TESTER` and funded from the developer's prepaid balance (`User.fundingBalanceCents`, `lib/funding-balance.ts`). Top-ups are Stripe Checkout payments for exactly the credited amount (SeedEnv absorbs Stripe processing; no surcharge, per card-network surcharge rules) tracked in `BalanceTopUp` and credited idempotently by the `SEEDENV_BALANCE_TOPUP` webhook branch with a `BALANCE_TOPUP` ledger row. Launch goes straight to `ACTIVE` if the balance covers the first tester; otherwise the cohort waits in `ESCROW_PENDING` and activates when its top-up is paid (abandoned top-ups return it to `DRAFT`). Accepting an application (`lib/slot-funding.ts`) atomically debits stipend + 20% platform fee (cumulative $15 floor, so the first tester carries it), recorded as a `SlotCharge` and an `ESCROW_DEPOSIT` row with no Stripe payment ID. Optional auto-reload (`User.autoReloadCents`) makes one off-session top-up when short. Freed paid slots are reused first. Ending a cohort (`endCohort`) or expiry credits unused places back to the balance via `sweepCampaignFunding` (every 10 minutes in-process and from `/api/cron/expire-slots`), which also settles stale top-ups. `withdrawBalance` refunds the balance to the funding cards newest top-up first (`BALANCE_WITHDRAWAL`).
- Bundle cohorts are `PREPAID`: created in `ESCROW_PENDING` and charged the flat bundle price through Checkout. Signed Checkout completion retrieves the Stripe session and verifies settled USD amount, developer ownership, and the exact pending ledger before activation. Duplicate events cannot reactivate paused or completed campaigns. Subscribe `/api/stripe/webhook` to `checkout.session.completed` and `checkout.session.async_payment_succeeded`; unsigned local payment simulations are no longer accepted.
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
- `/launch-circle` is the Launch Circle developer feed. Only the developer (or admin) workspace renders a composer; validators see a read-only "Validator Mode" notice and comment below. Dual-workspace members can switch to their developer workspace from that notice. Updates carry a `Changelog` / `Need Validation` / `Bug Fix` tag, an optional owned-cohort attachment with a build label, and a Public or Cohort-testers-only visibility choice. Comments carry a `General Feedback` / `Repro Log` / `Device Confirmed` tag plus an optional self-reported device label.
- Feed views are `All Updates`, `Following` (members only), and `Active Drops` (updates attached to an ACTIVE cohort), with free-text search over update bodies and cohort titles. Members can report posts and comments; authors/moderators remove content and admins see the moderation queue on the same page. Posts are limited to five per rolling 24 hours, comments to 20 per rolling hour, and reports to 20 per rolling day. Feeds and discussions are paginated, bodies render as Markdown with raw HTML disabled and outbound links marked `nofollow ugc`, and community activity awards no points.
- `Helpful` marks are one row per member per post and toggle on repeat clicks; they are not reputation and award no points. When fewer than three real updates match the current view, the feed appends a clearly separated, non-interactive `Sample updates` section labelled "Not real activity." so a quiet feed never reads as fabricated traffic. Searching hides samples entirely.
- The campaign builder includes 24 reusable micro-task briefs. These are mission steps, not independent reward claims; REP retains the existing bounty-based approval formula to avoid double-crediting old campaigns. Separate task payouts, the full proposed 62-quest catalog, and additional specialty rewards are not part of this initial release.

Apply migrations with `npx prisma migrate deploy` before running this release. Render startup now stops if migration deployment fails rather than starting against a missing schema. The additive `20261003_quests_applications_community` migration preserves existing REP, users, and submissions.

Run `npm run test:launch-circle` for Launch Circle privacy, write-authorisation, role-gating, and feed-rendering tests. Run `npm run test:console` for developer console shell tests (admin tool menu, dismissible fee banner, join-request states, cohort row layout, submission queue filters) `npm run test:applications` for the tester application queue (status bucketing, device telemetry fallback, claim timers, empty state, tester-side view), and `npm run test:account` for account page and landing-route tests. Run `npm run test:quests` for quest policy tests. The PostgreSQL integration test is skipped by default; set `RUN_QUEST_DB_TESTS=1` to exercise ledger idempotency, referral caps, exchange spending, pass reservation/refunds, developer ownership, and application acceptance against the configured database. Its fixtures live inside an intentionally rolled-back transaction; it sends no email and creates no real payouts.

## Clippers creator workspace

`/clippers` is a separate, authenticated creator-collaboration workspace linked from both consoles. It does not award tester REP or Quest XP and does not use Discovery Passes. Creators keep ownership; the paid agreement grants 90 days of organic repost rights from transfer completion. Paid ads, boosting, whitelisting, raw footage, and ownership transfer are excluded. Have counsel review these marketplace terms and Stripe's supported business/funds-holding model before commercial launch; the feature is not described as legal escrow.

Developers create immutable briefs with a fixed fee ($10-$1,000 USD), platform (TikTok, Instagram, YouTube), REP threshold, 0-5 included revision rounds, 3-30-day initial draft deadline, and 7-90-day public-post retention term. The total developer charge is the creator fee plus a fixed 5% platform fee, rounded to whole cents. Creators need a verified email, complete background/sample links, and adequate REP to apply; payout setup must be complete before funding. Social URLs are self-reported unless separately connected and verified. Developer acceptance opens an invited group room, but creators must wait for a signed Stripe webhook to confirm funding before uploading work.

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
- Optional growth engine: `GROWTH_ENABLED`, `GROWTH_APPROVAL_SECRET`, a notification webhook and provider keys (see [Growth engine](#growth-engine) and `.env.example`).

If `NEXTAUTH_SECRET` is missing, NextAuth will return `NO_SECRET` and protected routes will fail in production.

Check `/api/system/email-health` after deployment to verify auth email configuration without exposing secret values.

## Growth engine

An approval-gated marketing pipeline: weekly SEO article + social drafts, and an ad-spend kill-switch every 6 hours. Nothing is published, posted or paused without either a human approval or an explicit opt-in flag.

```
lib/growth/
  config.ts          env contract (Zod); adapters are live with credentials, mock in dev, disabled in production
  schemas.ts         Zod output contracts: research brief, blog post, per-platform social pack, ad metrics/decisions
  llm.ts             Gemini structured output (JSON schema + Zod repair loop) and function-calling loop
  retry.ts, log.ts   full-jitter backoff honouring Retry-After; JSON logs with secret redaction
  store.ts           Prisma store (content_drops, social_queue, ad_audits) and an in-memory store for dry runs/tests
  tools/             fetch_keyword_metrics (DataForSEO), stage_cms_post, queue_social_post (Ayrshare),
                     check_ad_performance_and_killswitch (Meta Marketing API)
  agents/            research (tool calling), copywriter + social, ads (deterministic, no LLM)
  approval.ts        HMAC review links (14 days) and the approve/reject state machine
  notify.ts          Slack / Discord / Telegram review cards and alerts
  pipeline.ts        runContentPipeline, runAdHealthCheck, runGrowthJob (isolated jobs + failure alerts)
app/api/cron/growth/[job]   CRON_SECRET-protected trigger (content | ads | all)
app/api/growth/review       confirmation page (GET, no side effects) + decision (POST)
app/(public)/blog           renders PUBLISHED drops only
scripts/growth-runner.ts    npm run growth -- <content|ads|all> [--dry-run] [--mock] [--force]
                            npm run growth -- update "what shipped" [--link https://...] [--dry-run] [--mock]
app/admin/growth/           admin form to draft product-update posts + list of recent posts with review links
.github/workflows/growth-*.yml   weekly content (Mon 13:00 UTC), ads every 6h
```

Flow: research picks a keyword using real DataForSEO numbers -> article is validated and stored as `DRAFTED` -> X, LinkedIn, Instagram and a TikTok video script (hook, shot-by-shot beats, caption) are stored as `PENDING_APPROVAL` -> a review card goes to Slack/Discord/Telegram. Approving the article publishes it to `/blog/<slug>` (or the optional CMS webhook). Social posts can only be approved after the article is live; approval schedules them in Ayrshare with the link appended. Rejected or failed drafts free their keyword.

Product updates: describe a release at `/admin/growth` (or with the `update` CLI job) to get the same four drafts without an article, linking to the URL you give (homepage by default). These work even when `GROWTH_ENABLED` is false.

Manual posting: TikTok always needs a filmed video, so approving it moves it to `MANUAL`, and so does approving any post while `AYRSHARE_API_KEY` is unset. The review page then shows copy-ready text (and the script for TikTok) with a **Mark as posted** button.

Setup: set `GROWTH_APPROVAL_SECRET`, `GEMINI_API_KEY` and at least one notification channel, try `npm run growth -- all --dry-run` locally (memory store, nothing sent), then set `GROWTH_ENABLED=true` on Render. Add `DATAFORSEO_*`, `AYRSHARE_API_KEY` and `META_*` as you adopt each channel; leave `AD_KILLSWITCH_ENFORCE=false` until alerts look right. The workflows reuse the `SEEDENV_CRON_SECRET` repository secret. Tests: `npm run test:growth`.
