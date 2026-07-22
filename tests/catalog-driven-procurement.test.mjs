import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("catalog procurement migration keeps legacy rows while adding spool quantities",async()=>{const [ensure,migration,schema]=await Promise.all([read("db/ensure-schema.ts"),read("drizzle/0047_catalog_driven_procurement.sql"),read("db/schema.ts")]);assert.match(ensure,/migration0047/);assert.match(ensure,/id:47,sql:migration0047/);for(const field of ["catalog_item_id","requested_spools","ordered_spools","received_spools","per_spool_net_grams","reorder_point_spools","target_stock_spools"])assert.match(migration,new RegExp(field));assert.match(migration,/PROCUREMENT_REQUEST_CATALOG_ORGANIZATION_MISMATCH/);assert.match(migration,/INVALID_RECEIVED_SPOOL_COUNT/);assert.match(schema,/requestedSpools:integer\("requested_spools"\)/)});

test("spool replenishment respects reorder point, target and incoming stock",async()=>{const {suggestedSpoolReplenishment}=await import("../procurement/workflow.ts");assert.equal(suggestedSpoolReplenishment(1,2,5,0),4);assert.equal(suggestedSpoolReplenishment(2,2,5,2),1);assert.equal(suggestedSpoolReplenishment(3,2,5,0),0);assert.equal(suggestedSpoolReplenishment(1,2,5,8),0)});

test("new requests use catalog identity and only create a compatibility bridge",async()=>{const api=await read("app/api/procurement/route.ts");assert.match(api,/ensureCompatibilityBatch/);assert.match(api,/catalogItemId=integer\(body\.catalogItemId\)/);assert.match(api,/requestedSpools=integer\(body\.requestedSpools\)/);assert.match(api,/INSERT INTO procurement_request_items[^\n]+catalog_item_id/);assert.match(api,/requestedSpools\*perSpoolNetGrams/);assert.match(api,/耗材主数据不存在或不属于当前组织/)});

test("purchase order and receiving guard both spool count and grams",async()=>{const api=await read("app/api/procurement/route.ts");assert.match(api,/INSERT INTO purchase_order_items[^\n]+catalog_item_id/);assert.match(api,/ri\.requested_spools/);assert.match(api,/receivedSpools\+spoolCount>row\.orderedSpools/);assert.match(api,/received_spools=received_spools\+\?/);assert.match(api,/实体卷数量超过采购未收卷数/)});

test("procurement UI selects master data and displays spool units",async()=>{const client=await read("app/procurement/procurement-client.tsx");for(const label of ["按耗材主数据补货","耗材主数据","采购卷数","单卷净重","建议","卷"])assert.match(client,new RegExp(label));assert.match(client,/itemsByOrder/);assert.doesNotMatch(client,/name="batchId"/)});

test("material master exposes audited replenishment policy controls",async()=>{const [api,client]=await Promise.all([read("app/api/material-master/route.ts"),read("app/material-master/material-master-client.tsx")]);assert.match(api,/action==="updateStockPolicy"/);assert.match(api,/target<reorder/);assert.match(api,/WHERE id=\? AND organization_id=\?/);assert.match(api,/material_master\.stock_policy\.updated/);for(const label of ["补货策略","触发补货库存","目标库存","保存策略"])assert.match(client,new RegExp(label))});
