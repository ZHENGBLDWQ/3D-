import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("supplier offer migration snapshots landed cost and approval",async()=>{const [ensure,migration,schema]=await Promise.all([read("db/ensure-schema.ts"),read("drizzle/0048_supplier_offers_cost_approval.sql"),read("db/schema.ts")]);assert.match(ensure,/migration0048/);assert.match(ensure,/id:48,sql:migration0048/);assert.match(migration,/CREATE TABLE `supplier_material_offers`/);for(const field of ["unit_price_cents_per_spool","tax_rate_bps","freight_cents_per_order","min_order_spools","lead_time_days","cost_status","landed_total_cents","landed_cost_cents_per_spool"])assert.match(migration,new RegExp(field));assert.match(migration,/SUPPLIER_MATERIAL_OFFER_ORGANIZATION_MISMATCH/);assert.match(schema,/sqliteTable\("supplier_material_offers"/)});

test("landed cost uses integer MYR cents",async()=>{const {supplierOfferCost}=await import("../procurement/workflow.ts");assert.deepEqual(supplierOfferCost(10,5000,600,1200),{subtotalCents:50000,taxCents:3000,freightCents:1200,landedTotalCents:54200,landedCentsPerSpool:5420});assert.equal(supplierOfferCost(3,1000,0,1).landedCentsPerSpool,1001)});

test("offers are organization scoped, dated and MOQ guarded",async()=>{const api=await read("app/api/procurement/route.ts");assert.match(api,/action==="offer"/);assert.match(api,/仅负责人或管理员可以维护供应商报价/);assert.match(api,/supplier_material_offers/);assert.match(api,/valid_from<=\?/);assert.match(api,/valid_until IS NULL OR valid_until>=\?/);assert.match(api,/requestedSpools<offer\.minOrderSpools/);assert.match(api,/采购数量低于最小起订量/)});

test("new purchase orders wait for cost approval before receipt",async()=>{const api=await read("app/api/procurement/route.ts");assert.match(api,/'pending'/);assert.match(api,/action==="approveCost"/);assert.match(api,/procurement\.cost\.approved/);assert.match(api,/row\.costStatus==="pending"/);assert.match(api,/采购成本尚未审批，不能收货/);assert.match(api,/unit_cost_cents_per_kg/)});

test("procurement UI compares landed cost and exposes approval state",async()=>{const client=await read("app/procurement/procurement-client.tsx");for(const label of ["供应商报价档案","最优报价","到岸成本","审批成本","等待成本审批","最小起订卷数","交期天数"])assert.match(client,new RegExp(label));assert.match(client,/bestOfferByRequest/);assert.match(client,/supplierOfferCost/)});
