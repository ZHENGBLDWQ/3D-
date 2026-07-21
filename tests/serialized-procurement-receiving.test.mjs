import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("serialized receipt migration links receipt, lot and spool facts",async()=>{const [ensure,migration,schema]=await Promise.all([read("db/ensure-schema.ts"),read("drizzle/0046_serialized_procurement_receiving.sql"),read("db/schema.ts")]);assert.match(ensure,/migration0046/);assert.match(ensure,/id:46,sql:migration0046/);for(const field of ["goods_receipt_id","purchase_lot_id","spool_count","per_spool_net_grams"])assert.match(migration,new RegExp(field));assert.match(migration,/MATERIAL_PURCHASE_LOT_RECEIPT_ORGANIZATION_MISMATCH/);assert.match(migration,/GOODS_RECEIPT_ITEM_LOT_ORGANIZATION_MISMATCH/);assert.match(schema,/goodsReceiptId:integer\("goods_receipt_id"\)/)});

test("procurement receipt creates an idempotent serialized inventory chain",async()=>{const api=await read("app/api/procurement/route.ts");assert.match(api,/spoolCount>100/);assert.match(api,/spoolCount\*perSpoolNetGrams/);assert.match(api,/实体卷总净重超过采购未收数量/);for(const table of ["goods_receipts","material_purchase_lots","material_spools","material_spool_movements","goods_receipt_items"])assert.match(api,new RegExp(`INSERT INTO ${table}`));assert.match(api,/receiptSpools\(org,duplicate\.id\)/);assert.match(api,/procurement\.receipt\.posted\.serialized/)});

test("receipt requires a catalog mapping and stores real cost provenance",async()=>{const api=await read("app/api/procurement/route.ts");assert.match(api,/c\.legacy_batch_id=poi\.batch_id/);assert.match(api,/尚未关联耗材主数据/);assert.match(api,/unit_cost_cents_per_kg/);assert.match(api,/supplierId/);assert.match(api,/lotNo/)});

test("procurement UI captures per-spool facts and reuses offline labels",async()=>{const [client,page]=await Promise.all([read("app/procurement/procurement-client.tsx"),read("app/procurement/page.tsx")]);for(const label of ["逐卷登记收货","本次卷数","单卷净重","空盘重量","供应商批号","确认收货并生成实体卷"])assert.match(client,new RegExp(label));assert.match(client,/SpoolLabel/);assert.match(client,/itemsByOrder/);assert.match(page,/spool-label\.css/)});
