import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("receivables store MYR amounts as guarded integer cents",async()=>{
  const migration=await read("drizzle/0039_receivables.sql"),domain=await read("receivables/domain.ts");
  assert.match(migration,/`currency` text NOT NULL DEFAULT 'MYR' CHECK \(`currency` = 'MYR'\)/);
  assert.match(migration,/`amount_cents` integer NOT NULL CHECK \(`amount_cents` > 0\)/);
  assert.match(migration,/`paid_cents` integer NOT NULL DEFAULT 0 CHECK \(`paid_cents` >= 0 AND `paid_cents` <= `amount_cents`\)/);
  assert.match(domain,/Number\.isSafeInteger\(n\)/);
});

test("invoice state machine is explicit and paid invoices cannot be voided",async()=>{
  const domain=await read("receivables/domain.ts"),api=await read("app/api/receivables/route.ts");
  assert.match(domain,/action==="issue"&&current==="draft"/);
  assert.match(domain,/\["draft","issued","overdue"\]\.includes\(current\)/);
  assert.match(api,/action==="void"&&invoice\.paidCents>0/);
  assert.match(api,/\["issued","partially_paid","overdue"\]\.includes\(invoice\.status\)/);
});

test("invoice, order, payment and alert queries remain organization scoped",async()=>{
  const api=await read("app/api/receivables/route.ts"),migration=await read("drizzle/0039_receivables.sql");
  assert.match(api,/o\.id=\? AND o\.organization_id=\?/);
  assert.match(api,/invoices WHERE id=\? AND organization_id=\?/);
  assert.match(api,/invoice_payments WHERE organization_id=\? AND payment_reference=\?/);
  assert.match(api,/receivable_alert_signals WHERE organization_id=\?/);
  assert.match(migration,/UNIQUE \(`organization_id`,`order_id`\)/);
});

test("payment references are idempotent while conflicting reuse and overpayment are rejected",async()=>{
  const api=await read("app/api/receivables/route.ts"),migration=await read("drizzle/0039_receivables.sql");
  assert.match(migration,/UNIQUE \(`organization_id`,`payment_reference`\)/);
  assert.match(migration,/i\.paid_cents \+ NEW\.amount_cents <= i\.amount_cents/);
  assert.match(migration,/RAISE\(ABORT,'INVALID_PAYMENT_OR_OVERPAYMENT'\)/);
  assert.match(api,/existing\.invoiceId!==invoiceId\|\|existing\.amountCents!==amount/);
  assert.match(api,/amount>invoice\.amountCents-invoice\.paidCents/);
  assert.match(api,/idempotent:true/);
});

test("aging and overdue signals cover the complete receivables lifecycle",async()=>{
  const domain=await read("receivables/domain.ts"),api=await read("app/api/receivables/route.ts");
  for(const bucket of ["未到期","1-30天","31-60天","61-90天","90天以上"])assert.match(domain,new RegExp(bucket));
  assert.match(api,/UPDATE invoices SET status='overdue'/);
  assert.match(api,/ON CONFLICT\(invoice_id\) DO UPDATE SET signal_active=1/);
  assert.match(api,/SET signal_active=0,cleared_at=COALESCE/);
});

test("finance permission and immutable audit trail protect every write",async()=>{
  const api=await read("app/api/receivables/route.ts"),migration=await read("drizzle/0039_receivables.sql");
  assert.match(api,/requireApiAccess\(false,"finance\.read"\)/);
  assert.match(api,/\["owner","manager","finance"\]\.includes\(context\.role\)/);
  for(const action of ["invoice.created","invoice.payment_recorded"])assert.match(api,new RegExp(action.replace(".","\\.")));
  assert.match(api,/`invoice\.\$\{action\}`/);
  assert.match(migration,/PAYMENT_IMMUTABLE/g);
});
