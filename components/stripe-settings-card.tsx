"use client";

import { UserRole } from "@prisma/client";
import { ArrowRight, Banknote, CreditCard, ExternalLink, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { createStripeConnectOnboardingLink, createStripePaymentMethodSetupLink } from "@/app/actions/accountActions";
import { releasePendingTesterPayouts } from "@/app/actions/submissionActions";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/utils";

const connectCountries = [
  ["US", "United States"], ["CA", "Canada"], ["GB", "United Kingdom"], ["AU", "Australia"],
  ["NZ", "New Zealand"], ["IE", "Ireland"], ["DE", "Germany"], ["FR", "France"],
  ["NL", "Netherlands"], ["ES", "Spain"], ["IT", "Italy"], ["SG", "Singapore"],
] as const;

const inputClass = "w-full rounded-lg border border-[#2A2F3D] bg-[#090A0F] px-4 py-3 text-white outline-none transition focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20";

export function StripeSettingsCard({
  role,
  stripeConfigured,
  paymentMethodSaved,
  connectAccountId,
  connectCountry,
  connectDetailsSubmitted,
  payoutsEnabled,
  pendingPayoutCount,
  pendingPayoutAmountCents,
  paymentSetupResult,
  connectSetupResult,
  draftId,
}: {
  role: UserRole;
  stripeConfigured: boolean;
  paymentMethodSaved: boolean;
  connectAccountId: string | null;
  connectCountry: string | null;
  connectDetailsSubmitted: boolean;
  payoutsEnabled: boolean;
  pendingPayoutCount: number;
  pendingPayoutAmountCents: number;
  paymentSetupResult?: string;
  connectSetupResult?: string;
  draftId?: string;
}) {
  const [country, setCountry] = useState(connectCountry || "US");
  const [message, setMessage] = useState("");
  const [payoutMessage, setPayoutMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isDeveloper = role === UserRole.DEVELOPER;
  const isTester = role === UserRole.TESTER;

  function setupFundingMethod() {
    setMessage("");
    startTransition(async () => {
      const result = await createStripePaymentMethodSetupLink(draftId);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      window.location.assign(result.url);
    });
  }

  function setupPayoutAccount() {
    setMessage("");
    startTransition(async () => {
      const result = await createStripeConnectOnboardingLink(country);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      window.location.assign(result.url);
    });
  }

  function releasePayouts() {
    setPayoutMessage("");
    startTransition(async () => {
      try {
        const result = await releasePendingTesterPayouts();
        setPayoutMessage(result.releasedCount
          ? `${result.releasedCount} payout${result.releasedCount === 1 ? "" : "s"} sent to Stripe. ${result.pendingCount} remain pending.`
          : `${result.pendingCount} payout${result.pendingCount === 1 ? "" : "s"} still pending. Check Stripe account status and available platform balance.`);
      } catch (error) {
        setPayoutMessage(error instanceof Error ? error.message : "Could not release pending payouts.");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-[#1F2430] bg-[#0E1017]/80 p-5 backdrop-blur-md sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {isDeveloper ? <CreditCard className="mt-1 size-5 text-amber-500" /> : <Banknote className="mt-1 size-5 text-amber-500" />}
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-500">Stripe setup</p>
            <h2 className="mt-1 text-lg font-bold text-white">{isDeveloper ? "Campaign funding method" : "Tester payout account"}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
              {isDeveloper
                ? "Save a card securely with Stripe so campaign escrow checkout can use your funding account. SeedEnv never stores card numbers."
                : "Connect a Stripe Express account to receive approved tester payouts. Identity and bank details are entered on Stripe."}
            </p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${isDeveloper && paymentMethodSaved || isTester && payoutsEnabled ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-300" : "border-amber-500/25 bg-amber-950/20 text-amber-200"}`}>
          {isDeveloper ? paymentMethodSaved ? "Funding method saved" : "Setup required" : isTester ? payoutsEnabled ? "Payouts enabled" : connectDetailsSubmitted ? "Stripe review pending" : "Setup required" : "Not applicable"}
        </span>
      </div>

      {draftId && isDeveloper ? (
        <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4">
          <p className="text-sm font-semibold text-amber-100">Your no-charge draft is saved.</p>
          <p className="mt-1 text-xs leading-5 text-neutral-400">{paymentMethodSaved ? "Resume the draft when you’re ready to continue to escrow checkout." : "Finish saving a payment method with Stripe, then return here to continue the draft."}</p>
          {paymentMethodSaved ? <Link className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-amber-300 hover:text-amber-200" href={`/console?view=new-drop&draft=${encodeURIComponent(draftId)}`}>Resume saved draft <ArrowRight className="size-4" /></Link> : null}
        </div>
      ) : null}

      {paymentSetupResult === "success" && isDeveloper ? <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-950/30 p-3 text-sm text-emerald-200" role="status">Stripe returned successfully. Your funding method appears here once setup is confirmed.</p> : null}
      {paymentSetupResult === "cancelled" && isDeveloper ? <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-950/20 p-3 text-sm text-amber-200" role="status">Payment setup was cancelled; no card was saved.</p> : null}
      {connectSetupResult === "return" && isTester ? <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-950/30 p-3 text-sm text-emerald-200" role="status">Stripe onboarding returned. Payout availability will update after Stripe completes its review.</p> : null}
      {connectSetupResult === "refresh" && isTester ? <p className="mt-4 rounded-lg border border-amber-500/20 bg-amber-950/20 p-3 text-sm text-amber-200" role="status">Stripe onboarding needs another step. Continue setup to finish providing your details.</p> : null}

      {isTester && !payoutsEnabled ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {!connectAccountId ? (
            <label className="min-w-48 flex-1 text-sm font-semibold text-neutral-300">Account country
              <select className={`${inputClass} mt-2`} onChange={(event) => setCountry(event.target.value)} value={country}>
                {connectCountries.map(([code, label]) => <option key={code} style={{ backgroundColor: "#0E1017", color: "#F8FAFC" }} value={code}>{label}</option>)}
              </select>
            </label>
          ) : null}
          <Button disabled={!stripeConfigured || isPending} onClick={setupPayoutAccount} type="button">
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
            {isPending ? "Opening Stripe…" : connectAccountId ? "Continue Stripe payout setup" : "Set up payouts with Stripe"}
          </Button>
        </div>
      ) : null}

      {isTester && pendingPayoutCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
          <div><p className="text-sm font-semibold text-white">{pendingPayoutCount} approved payout{pendingPayoutCount === 1 ? "" : "s"} pending</p><p className="mt-1 text-xs text-neutral-400">{formatCents(pendingPayoutAmountCents)} {payoutsEnabled ? "ready to send to your Stripe account" : "waiting for Stripe payout setup"}</p></div>
          {payoutsEnabled ? <Button disabled={isPending} onClick={releasePayouts} type="button">{isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Banknote className="size-4" />}{isPending ? "Sending…" : "Receive pending payouts"}</Button> : null}
        </div>
      ) : null}
      {payoutMessage ? <p className="mt-3 text-sm text-neutral-300" role="status">{payoutMessage}</p> : null}

      {isDeveloper ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={!stripeConfigured || isPending} onClick={setupFundingMethod} type="button" variant={paymentMethodSaved ? "ghost" : "primary"}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
            {isPending ? "Opening Stripe…" : paymentMethodSaved ? "Update saved card" : "Set up funding card"}
          </Button>
          {paymentMethodSaved ? <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300"><ShieldCheck className="size-4" /> Stored by Stripe</span> : null}
        </div>
      ) : null}

      {!stripeConfigured ? <p className="mt-3 text-xs text-rose-300">Stripe is not configured for this deployment.</p> : null}
      {message ? <p className="mt-3 text-sm text-rose-300" role="alert">{message}</p> : null}
    </section>
  );
}