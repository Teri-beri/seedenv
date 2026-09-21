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
- `STRIPE_SECRET_KEY`: Stripe secret key for escrow checkout.
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret for `/api/stripe/webhook`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROOF_BUCKET`: proof screenshot storage.

## Core Flows

- Developers create campaigns in `ESCROW_PENDING`, fund tester payout pool plus 20% SeedEnv fee, then Stripe webhook activates the campaign.
- Testers claim active seed missions atomically. A pending submission locks one slot for 30 minutes.
- Proof submission validates feedback, client-side SHA-256 hashes screenshots, rejects duplicate hashes, uploads proof media, and leaves proof pending for review.
- Approvals credit tester wallet balance, award XP, update rank tier, and write a completed wallet transaction.
- Rejections return the claimed slot to the public pool.
- `/api/cron/expire-slots` expires abandoned 30-minute locks.
- `/api/assets/download?campaignId=...` exports approved proof media and a manifest as a zip.
- `npm run seed:goddesses-beta` creates or updates the active Goddesses TestFlight validation mission. Run it from the Render shell after deployment so it uses the production `DATABASE_URL`.

## Notes

SeedEnv uses NextAuth email magic links through Resend. The current preview fallback still uses seeded SeedEnv users when no session is present; set `SEEDENV_PREVIEW_USER_ID` to force a specific preview identity.

## Render Environment

Render does not receive local `.env` values. Set these in the Render dashboard before relying on protected routes:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL=https://seedenv.com`
- `NEXTAUTH_URL=https://seedenv.com`
- `NEXTAUTH_SECRET`
- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM=SeedEnv Authentication <auth@seedenv.com>`
- `SUPABASE_PROOF_BUCKET=proof-screenshots`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`
- `CRON_SECRET`
- `NEXT_PUBLIC_TERIMUS_URL` — the exact TERIMUS LLC landing-page URL used by the public footer.
- `SEEDENV_ANALYTICS_OWNER_EMAIL` — the exact owner email allowed to view site analytics in the developer console. Analytics is hidden when this is unset.

If `NEXTAUTH_SECRET` is missing, NextAuth will return `NO_SECRET` and protected routes will fail in production.

Check `/api/system/email-health` after deployment to verify auth email configuration without exposing secret values.
