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

## Required Production Environment

- `DATABASE_URL`: PostgreSQL connection string.
- `NEXT_PUBLIC_APP_URL`: public app URL for Stripe redirects, usually `https://seedenv.com`.
- `NEXTAUTH_URL`: canonical auth URL if NextAuth is enabled, usually `https://seedenv.com`.
- `STRIPE_SECRET_KEY`: Stripe secret key for escrow checkout.
- `STRIPE_WEBHOOK_SECRET`: Stripe webhook signing secret for `/api/stripe/webhook`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROOF_BUCKET`: proof screenshot storage.

## Core Flows

- Developers create campaigns in `ESCROW_PENDING`, fund tester payout pool plus 20% SeedEnv fee, then Stripe webhook activates the campaign.
- Testers claim active waves atomically. A pending submission locks one slot for 30 minutes.
- Proof submission validates feedback, client-side SHA-256 hashes screenshots, rejects duplicate hashes, uploads proof media, and leaves proof pending for review.
- Approvals credit tester wallet balance, award XP, update rank tier, and write a completed wallet transaction.
- Rejections return the claimed slot to the public pool.
- `/api/cron/expire-slots` expires abandoned 30-minute locks.
- `/api/assets/download?campaignId=...` exports approved proof media and a manifest as a zip.

## Notes

The default development auth uses preview users so the application can run before a real auth provider is connected. Production intentionally throws if auth is not configured through `SEEDENV_PREVIEW_USER_ID` or a future provider integration.
