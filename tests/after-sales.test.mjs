import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("after-sales cases and every dependent read are organization scoped",async()=>{const api=await read("app/api/after-sales/route.ts"),migration=await read("drizzle/0040_after_sales_rework.sql");assert.match(api,/customer_cases WHERE id=\? AND organization_id=\?/);assert.match(api,/rework_orders WHERE organization_id=\? AND idempotency_key=\?/);assert.match(migration,/AFTER_SALES_CUSTOMER_SCOPE/);assert.match(migration,/REWORK_CASE_SCOPE/)});
test("case workflow is explicit and supports controlled reopening",async()=>{const flow=await read("after-sales/workflow.ts");assert.match(flow,/resolved:\["closed","reopened"\]/);assert.match(flow,/closed:\["reopened"\]/);assert.match(flow,/reopened:\["triaged","in_progress","resolved","closed"\]/)});
test("SLA stops only after resolution or closure",async()=>{const flow=await read("after-sales/workflow.ts");assert.match(flow,/\["resolved","closed"\]\.includes\(status\)/);assert.match(flow,/Date\.parse\(dueAt\)<now\.getTime\(\)\?"breached":"on_track"/)});
test("rework claim is idempotent and creates a queue job without dispatch bypass",async()=>{const api=await read("app/api/after-sales/route.ts"),migration=await read("drizzle/0040_after_sales_rework.sql");assert.match(migration,/UNIQUE \(`organization_id`,`idempotency_key`\)/);assert.match(api,/existing\?\.jobId/);assert.match(api,/crypto\.randomUUID\(\)/);assert.match(api,/'','排队',0,quantity,2,0/);assert.doesNotMatch(api,/INSERT INTO (printer_commands|dispatch_workflows|schedule_runs)/)});
test("refunds remain non-negative integer cents",async()=>{const flow=await read("after-sales/workflow.ts"),migration=await read("drizzle/0040_after_sales_rework.sql");assert.match(flow,/Number\.isSafeInteger\(cents\)/);assert.match(migration,/refund_cents.*CHECK \(`refund_cents` >= 0\)/)});
