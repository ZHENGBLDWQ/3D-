import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("quality migration makes each workflow settlement idempotent and inventory immutable",async()=>{
  const sql=await read("drizzle/0030_quality_material_settlement.sql");
  const runner=await read("db/ensure-schema.ts");
  for(const table of ["production_outcomes","quality_inspections","scrap_records","material_settlements"])assert.match(sql,new RegExp(`CREATE TABLE .${table}.`));
  assert.match(sql,/UNIQUE \(`workflow_id`\)/);
  assert.match(sql,/UNIQUE \(`workflow_id`,`reservation_id`\)/);
  assert.match(sql,/MATERIAL_SETTLEMENT_INSUFFICIENT_STOCK/);
  assert.match(sql,/quality_inventory_transactions_immutable_update/);
  assert.match(sql,/quality_inventory_transactions_immutable_delete/);
  assert.match(sql,/INSERT INTO `inventory_transactions`/);
  assert.match(runner,/migration0030/);
  assert.match(runner,/id:30,sql:migration0030/);
});

test("quality API enforces organization scope, full reservation settlement and audit",async()=>{
  const api=await read("app/api/quality/route.ts");
  assert.match(api,/w\.organization_id=\?/);
  assert.match(api,/j\.organization_id=w\.organization_id/);
  assert.match(api,/requested\.length!==reservations\.length/);
  assert.match(api,/can\(context,"printers\.control"\)/);
  assert.match(api,/quality\.settled/);
  assert.match(api,/已经结算，不能重复扣料/);
  assert.match(api,/actual_grams-row\.reservedGrams|row\.actualGrams-row\.reservedGrams/);
});

test("quality validator accepts partial success and rejects invalid or duplicate results",async()=>{
  const source=await read("quality/settlement.ts");
  assert.match(source,/successful\+failed!==input\.plannedQuantity/);
  assert.match(source,/QUALITY_FAILURE_REASON_REQUIRED/);
  assert.match(source,/QUALITY_SETTLEMENT_DUPLICATE_RESERVATION/);
  assert.match(source,/successful===0\?"failed":"partial"/);
});

test("quality page captures actual material, scrap and failure evidence",async()=>{
  const page=await read("app/quality/quality-client.tsx");
  assert.match(page,/successfulQuantity/);
  assert.match(page,/failedQuantity/);
  assert.match(page,/actual-/);
  assert.match(page,/scrapGrams/);
  assert.match(page,/failureReason/);
});
