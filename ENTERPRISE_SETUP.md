# Enterprise Billing, Payouts, and Support

## Database Gate

The additive migration `20261005_enterprise_billing_support` adds BillingProfile,
SupportTicket, and WalletTransaction checkout snapshots. Review the migration
and back up the database. Production `npm start` now runs `prisma migrate deploy`
before schema checks, the existing seed step, and `next start`; Render must use
`npm run start`. The migration was not applied locally by this implementation.

The reported Prisma P2022 error (`WalletTransaction.campaignId` missing) confirms
production code ran before the billing migration. The Account page now selects
only its displayed legacy transaction fields; that compatibility fix does not
replace the required migration for billing and support modules.

Migration failure stops startup rather than serving incompatible code. If Prisma
reports P3005 (an existing database without migration history) or P3009 (a failed
prior migration), inspect and reconcile the history against the actual schema
with a backup first. Do not reset the database, blindly mark unapplied migrations
applied, or bypass the startup gate. This repository contains additive migrations
for an existing SeedEnv database, not a fresh-database bootstrap migration.

## Billing

- `/dashboard/developer/billing` requires a Developer/Admin session and lists
  the latest 100 owned funding records. Company details are saved per account.
- Future real checkout records capture the company/address/tax identifier and
  cohort/fee amounts before any Stripe charge. Existing confirmed funding records
  are not retrospectively assigned today's fee or today's company identity.
- `/api/billing/invoices/[id]` requires the payment owner and a completed,
  reconciled escrow record. Pending payments cannot produce invoices. Legacy
  payments without snapshots need operator reconciliation/Stripe receipts.
- PDF receipts use pdf-lib with the bundled, OFL-licensed Noto Sans font, traced
  into the production route. These payment receipts do not certify tax/VAT
  registration or replace locally required tax invoice particulars. Confirm
  TERIMUS LLC issuer address/tax details with your accountant before treating
  these as statutory tax invoices.

## Stripe Connect

Keep STRIPE_SECRET_KEY and signed webhook configuration in the existing server
environment. Connect onboarding is the existing idempotent Express integration.
`/dashboard/validator/payouts` displays actual masked external bank details and
Stripe's current account payout schedule, plus paid/pending ledger totals.

Weekly bank payouts, 48-hour availability after sign-off, and automatic 1099
reporting are not interchangeable or universal Stripe defaults. Configure and
verify payout cadence and tax reporting in Stripe for supported jurisdictions.
No provider schedule, tax setting, real transfer, or settlement was changed here.

## Support Operations

The global Support & Feedback drawer uses authenticated server actions. Requests
store bounded categories/details and server-derived user ID, role, and browser
user-agent with a query-free application route. Five submissions per account per
hour are allowed inside a serializable transaction. Credentials must not be
included in reports. The Privacy page discloses the new collection.

Administrators triage open requests at `/admin/support` and can mark them resolved.
Requests also notify `terimus@seedenv.com` using the existing Resend API key and
verified AUTH_EMAIL_FROM sender. Failed/unconfigured delivery does not erase the
ticket; the drawer reports delivery availability separately. Replies use the
member's recorded email; guests/access/security reports can contact the mailbox
directly. Set a retention policy, verify mailbox delivery, and staff the queue.

## Public Launch Circle

The additive `20261005_public_launch_circle` migration marks existing posts
private by default. New developer updates include an explicit public-visibility
choice; public updates and their visible comments appear in `/launch-circle`.
The landing is one continuous page with `#engine`, `#validators`, `#cohorts`,
`#pricing`, and `#pwa` sections. Older `?view=` links redirect to their section
anchors. Header navigation uses reduced-motion-aware smooth scrolling.
Launch Circle is a separate far-right header action, not an embedded landing
section. Older `?view=circle` links redirect to `/launch-circle`.
Public `/launch-circle` and discussion reads exclude private/hidden content when no
member session is available. Publishing, commenting, reports, and moderation
still require authenticated server actions and existing rate limits.

Guest comment actions offer Developer/Tester sign-in choices with the exact
discussion callback. Members with both workspaces must choose their participation
workspace before composing; switching stays in Launch Circle rather than jumping
to a console. No old members-only posts are published automatically.

## Public Status

The footer links to `https://status.seedenv.com`; provision this domain and a
real monitoring source before publishing operational metrics. Optional public
build-time values are:

```text
NEXT_PUBLIC_SEEDENV_STATUS=operational|degraded|maintenance
```

When operational status is configured, the clean monospace badge reads
"All Systems Operational" without an uptime percentage. Without a verified
status, it remains a neutral "System Status" link. Do not publish operational
health merely as decorative trust copy. Build-time values must be updated with
each status change; a live provider widget/API is
preferable once a monitoring vendor is configured.

## Verification

Run the enterprise test with mocked providers (no real DB/Stripe traffic):

```bash
node --conditions=react-server --experimental-test-module-mocks --import tsx --test scripts/enterprise.test.ts
```

Then run scoped ESLint with `--max-warnings 0` and `npm run build:local`.
Confirm live checkout/webhook reconciliation and tax/settlement settings in a
Stripe test environment and staging database before production enablement.

## Existing Dependency Security Gate

The release upgrades Next.js and its matching lint configuration to 16.3.8.
The October 5 post-upgrade audit reports zero critical advisories and nine
remaining high advisories in existing authentication/mail and lint-tooling
dependencies, not the new PDF packages. Review compatible authentication and
tooling remediation separately; forced major upgrades were not performed.