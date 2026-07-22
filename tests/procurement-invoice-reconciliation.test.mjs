import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("invoice reconciliation migration is scoped and auditable",async()=>{const [migration,ensure,schema]=await Promise.all([read("drizzle/0049_procurement_invoice_reconciliation.sql"),read("db/ensure-schema.ts"),read("db/schema.ts")]);for(const table of ["supplier_invoices","material_cost_adjustments"])assert.match(migration,new RegExp(`CREATE TABLE \`${table}\``));for(const field of ["reconciliation_status","original_unit_cost_cents_per_kg","variance_cents","skipped_settled"])assert.match(migration,new RegExp(field));assert.match(migration,/SUPPLIER_INVOICE_ORGANIZATION_MISMATCH/);assert.match(ensure,/id:49,sql:migration0049/);assert.match(schema,/sqliteTable\("supplier_invoices"/)});

test("invoice variance uses integer cents",async()=>{const source=await read("procurement/workflow.ts");assert.match(source,/Math\.round\(actualSubtotalCents\)/);assert.match(source,/actualTotalCents=subtotal\+tax\+freight/);assert.match(source,/varianceCents=actualTotalCents-approved/);const approved=1100,actual=Math.round(10*100)+Math.round(1.01*100);assert.equal(actual-approved,1)});

test("invoice submission requires completed approved purchase order",async()=>{const api=await read("app/api/procurement/route.ts");assert.match(api,/action==="invoice"/);assert.match(api,/order\.status!=="completed"\|\|order\.costStatus!=="approved"/);assert.match(api,/supplierInvoiceVariance/);assert.match(api,/procurement\.invoice\.submitted/)});

test("variance approval protects settled usage history",async()=>{const api=await read("app/api/procurement/route.ts");assert.match(api,/u\.settled_at IS NOT NULL/);assert.match(api,/skipped_settled/);assert.match(api,/original_unit_cost_cents_per_kg=COALESCE/);assert.doesNotMatch(api,/UPDATE print_material_usage_lines SET cost_cents/);assert.match(api,/settledUsageImmutable:true/)});

test("procurement UI exposes invoice entry and review",async()=>{const ui=await read("app/procurement/procurement-client.tsx");for(const label of ["供应商发票与实际成本","录入发票","批准差异","已结算打印成本不会被追溯修改"])assert.ok(ui.includes(label))});
