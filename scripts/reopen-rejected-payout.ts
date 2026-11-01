// Operator-only repair: reopens a tester transfer that Stripe definitively rejected before the
// automatic retry fix existed. It moves no money; the tester's next "Receive pending payouts" does.
// Usage: npx tsx scripts/reopen-rejected-payout.ts --operation seedenv-payout-<id> --rejected-request req_... [--apply]
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

const prisma = new PrismaClient();

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return process.argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function main() {
  const operationId = readArg("--operation")?.trim();
  const requestId = readArg("--rejected-request")?.trim();
  const apply = process.argv.includes("--apply");
  if (!operationId?.startsWith("seedenv-payout-")) throw new Error("Missing --operation seedenv-payout-<ledgerId>.");
  if (!requestId?.startsWith("req_")) throw new Error("Missing --rejected-request req_... (the original 4xx request from Stripe Workbench → Logs).");
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is required.");

  const operation = await prisma.billingOperation.findUnique({ where: { id: operationId } });
  if (!operation) throw new Error("Billing operation not found.");
  if (operation.kind !== "PAYOUT") throw new Error(`Only PAYOUT operations can be reopened (found ${operation.kind}).`);
  if (operation.state === "SETTLED" || operation.remoteId) throw new Error("Operation already has a Stripe transfer; use normal reconciliation.");
  if (!operation.destinationId) throw new Error("Operation has no destination account.");
  const ledger = await prisma.walletTransaction.findUnique({ where: { id: operation.ledgerId ?? "" } });
  if (!ledger || ledger.status !== "PENDING" || ledger.amountCents !== operation.amountCents) throw new Error("Wallet ledger is not a matching pending payout.");

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia" });
  const found = new Set<string>();
  for await (const transfer of stripe.transfers.list({ transfer_group: operation.id, limit: 100 })) found.add(transfer.id);
  for await (const transfer of stripe.transfers.list({ destination: operation.destinationId, limit: 100 })) {
    if (transfer.metadata?.seedenvOperationId === operation.id || transfer.metadata?.seedenvLedgerTransactionId === operation.ledgerId) found.add(transfer.id);
  }
  if (found.size) throw new Error(`Stripe already has matching transfer(s) ${[...found].join(", ")}; attach and reconcile instead of reopening.`);

  console.log(`Operation ${operation.id}: ${operation.amountCents} cents to ${operation.destinationId}, state ${operation.state}, attempt ${operation.attempt}.`);
  console.log("No matching Stripe transfer exists.");
  if (!apply) {
    console.log("Dry run only. Confirm the request in Stripe logs returned 4xx with no transfer, then rerun with --apply.");
    return;
  }
  const updated = await prisma.billingOperation.updateMany({
    where: { id: operation.id, state: { in: ["RESERVED", "SUBMITTED", "FAILED"] }, remoteId: null, attempt: operation.attempt },
    data: { state: "RESERVED", firstAttemptAt: null, sourceChargeId: null, attempt: operation.attempt + 1, error: `Reopened by operator after Stripe rejected ${requestId}.` },
  });
  if (updated.count !== 1) throw new Error("Operation changed concurrently; nothing was reopened.");
  console.log(`Reopened as attempt ${operation.attempt + 1}. The tester can now press "Receive pending payouts".`);
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
