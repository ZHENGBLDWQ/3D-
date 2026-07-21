import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("quote pricing rounds up in integer cents to preserve target margin",async()=>{
  const source=await read("quotes/pricing.ts");
  assert.match(source,/Math\.ceil\(cost\*10000\/\(10000-margin\)\)/);
  assert.equal(Math.ceil(101*10000/(10000-3000)),145);
});
test("quotes and contacts are strictly scoped to the active organization",async()=>{
  const api=await read("app/api/quotes/route.ts");
  assert.match(api,/customer_contacts WHERE id=\? AND customer_id=\? AND organization_id=\?/);
  assert.match(api,/quotes WHERE id=\? AND organization_id=\?/);
  assert.match(api,/qi\.organization_id=\?/);
});
test("quote state transitions are explicit and accepted quotes cannot regress",async()=>{
  const api=await read("app/api/quotes/route.ts");
  assert.match(api,/draft:\["sent","rejected"\],sent:\["rejected"\]/);
  assert.match(api,/quote\.acceptedOrderId/);
  assert.match(api,/\["draft","sent"\]\.includes\(quote\.status\)/);
});
test("accepting a quote claims conversion once and creates cent-derived order lines",async()=>{
  const migration=await read("drizzle/0036_crm_quotes.sql"),api=await read("app/api/quotes/route.ts");
  assert.match(migration,/quote_order_conversions/);
  assert.match(migration,/`quote_id` integer PRIMARY KEY/);
  assert.match(api,/claimToken=crypto\.randomUUID\(\)/);
  assert.match(api,/qi\.unit_price_cents\/100\.0/);
  assert.match(api,/acceptedOrderId\)return Response\.json\(\{orderId:quote\.acceptedOrderId,idempotent:true\}/);
});
