import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("variance migration is registered and protects organization-linked evidence",async()=>{const [ensure,migration,schema]=await Promise.all([read("db/ensure-schema.ts"),read("drizzle/0043_material_variance_cases.sql"),read("db/schema.ts")]);assert.match(ensure,/migration0043/);assert.match(ensure,/id:43,sql:migration0043/);assert.match(migration,/CREATE TABLE `material_variance_cases`/);assert.match(migration,/UNIQUE \(`organization_id`,`weight_check_id`\)/);assert.match(migration,/MATERIAL_VARIANCE_ORGANIZATION_MISMATCH/);assert.match(schema,/sqliteTable\("material_variance_cases"/)});

test("weighing above tolerance creates a review case without changing book inventory",async()=>{const api=await read("app/api/inventory-v2/route.ts"),branch=api.slice(api.indexOf("if(requiresReview)"),api.indexOf("const movement=",api.indexOf("if(requiresReview)")));assert.match(api,/Math\.abs\(variance\)>2/);assert.match(branch,/INSERT INTO spool_weight_checks/);assert.match(branch,/INSERT INTO material_variance_cases/);assert.match(branch,/requiresReview:true/);assert.doesNotMatch(branch,/remaining_net_grams=\?/)});

test("variance resolution requires reason, guards stale books and writes immutable movement",async()=>{const api=await read("app/api/material-variances/route.ts");assert.match(api,/requireApiAccess\(true,"inventory\.write"\)/);assert.match(api,/currentNetGrams.*bookNetGrams/);assert.match(api,/账面余量已变化/);assert.match(api,/称重误差/);assert.match(api,/INSERT INTO material_spool_movements/);assert.match(api,/idempotency_key/);assert.match(api,/organization_id=\?/);assert.match(api,/recordAudit/)});

test("variance screen is retired in favor of audited offline inventory updates",async()=>{const [page,inventory,overview,api]=await Promise.all([read("app/material-variances/page.tsx"),read("app/inventory/inventory-v2-client.tsx"),read("app/inventory/stock-overview-exact.tsx"),read("app/api/inventory-v2/route.ts")]);assert.match(page,/redirect\("\/inventory"\)/);assert.doesNotMatch(inventory,/差异处理中心/);assert.match(overview,/线下核对说明/);assert.match(api,/offline-check:/);assert.match(api,/adjustmentNote\.length<4/);assert.match(api,/inventory_v2\.spool\.updated/)});
