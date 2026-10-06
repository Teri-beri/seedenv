import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import { invoiceNumber } from "./billing";
import type { InvoiceSnapshot } from "./enterprise-rules";

export async function generateInvoicePdf(input: { id: string; date: Date; amountCents: number; paymentReference: string; snapshot: InvoiceSnapshot }) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(await readFile(join(process.cwd(), "assets/fonts/NotoSans.ttf")), { subset: true });
  let page = document.addPage([595, 842]);
  let cursor = 784;
  const line = (text: string, size = 11) => {
    const words = text.replace(/[\r\n\t]/g, " ").split(/\s+/);
    let row = "";
    const draw = (value: string) => {
      if (cursor < 60) { page = document.addPage([595, 842]); cursor = 784; }
      page.drawText(value, { x: 48, y: cursor, size, font, color: rgb(0.08, 0.1, 0.14) });
      cursor -= size + 9;
    };
    for (const word of words) {
      const next = row ? `${row} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= 499) { row = next; continue; }
      if (row) draw(row);
      row = "";
      for (const character of word) {
        if (row && font.widthOfTextAtSize(row + character, size) > 499) { draw(row); row = ""; }
        row += character;
      }
    }
    if (row) draw(row);
  };
  const money = (cents: number) => `USD ${(cents / 100).toFixed(2)}`;
  const logo = await document.embedPng(await readFile(join(process.cwd(), "public/seedenv-logo-v3.png")));
  page.drawImage(logo, { x: 475, y: 722, width: 72, height: 72 });
  line("SeedEnv", 24);
  line("Payment receipt / invoice", 16);
  line("TERIMUS LLC");
  line(`Invoice: ${invoiceNumber(input.id, input.date)}`);
  line(`Receipt: ${input.id}`);
  line(`Date: ${input.date.toISOString().slice(0, 10)}`);
  line(`Payment reference: ${input.paymentReference}`);
  cursor -= 20;
  line("Bill to", 14);
  const company = input.snapshot.company;
  if (company) {
    line(company.companyName);
    if (company.taxId) line(`Tax ID / VAT: ${company.taxId}`);
    if (company.billingEmail) line(`Billing contact: ${company.billingEmail}`);
    line(company.addressLine1);
    if (company.addressLine2) line(company.addressLine2);
    line(`${company.city}, ${company.region} ${company.postalCode}, ${company.country}`);
  } else line("Billing details were not supplied at checkout.");
  cursor -= 20;
  line(`Cohort: ${input.snapshot.cohortTitle}`, 14);
  line(`Cohort ID: ${input.snapshot.cohortId}`);
  line(`Tester reward pool: ${money(input.snapshot.rewardPoolCents)}`);
  line(`Platform fee (recorded at checkout): ${money(input.snapshot.platformFeeCents)}`);
  line(`Total paid: ${money(input.amountCents)}`, 14);
  cursor -= 20;
  line("Stripe processing and payout fees, if applicable, are separate. This receipt does not certify VAT registration or replace a jurisdiction-specific tax invoice.", 9);
  document.setTitle(`SeedEnv receipt ${invoiceNumber(input.id, input.date)}`);
  document.setAuthor("TERIMUS LLC");
  return document.save();
}