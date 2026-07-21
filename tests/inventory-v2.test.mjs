import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("inventory v2 API scopes every domain read and write to the active organization",async()=>{
 const api=await read("app/api/inventory-v2/route.ts");
 assert.match(api,/getAccessContext/);assert.match(api,/requireApiAccess\(true,"inventory\.write"\)/);assert.match(api,/context\.organizationId/);
 for(const table of ["material_catalog_items","material_spools","inventory_locations_v2","printer_feed_positions","spool_bindings","material_spool_movements","print_material_usage_lines"]){assert.match(api,new RegExp(table),table)}
 assert.match(api,/printer_bindings WHERE printer_id=\? AND organization_id=\?/);
 assert.match(api,/organization_id=\?/g);
});

test("issue and return move a serialized spool without reducing organization assets",async()=>{
 const api=await read("app/api/inventory-v2/route.ts");
 assert.match(api,/action==="issue"/);assert.match(api,/action==="return"/);
 assert.match(api,/state='in_use'/);assert.match(api,/state=CASE WHEN remaining_net_grams<=0 THEN 'empty' ELSE 'open_storage'/);
 assert.match(api,/net_grams_delta,idempotency_key[\s\S]+VALUES\(\?,\?,'issue',\?,\?,0/);
 assert.match(api,/组织资产不减少/);
});

test("unknown AMS slots remain warnings and can never guess a spool deduction",async()=>{
 const api=await read("app/api/inventory-v2/route.ts"),page=await read("app/inventory/inventory-v2-client.tsx");
 assert.match(api,/unboundSlots/);assert.match(api,/NOT EXISTS\(SELECT 1 FROM spool_bindings/);assert.match(api,/f\.feed_kind feedKind,f\.toolhead/);
 assert.match(page,/不会自动选择库存卷或扣减/);assert.match(page,/未绑定实体卷/);
 assert.doesNotMatch(api,/UPDATE material_spools[\s\S]{0,250}bambu_ams_slots/);
});

test("inventory hub exposes the fixed warehouse and in-use operating areas",async()=>{
 const [page,css]=await Promise.all([read("app/inventory/inventory-v2-client.tsx"),read("app/inventory/inventory-v2.css")]);
 for(const label of ["库存管理","未拆封库存","低库存与补货","采购在途","库存流水","使用中","已开封周转","实时预留与任务结算","辅助工具头","外置料盘"]){assert.match(page,new RegExp(label),label)}
 assert.match(page,/href="\/procurement"/);assert.match(page,/action:"weigh"|value="weigh"/);assert.match(page,/action:"loss"|value="loss"/);assert.match(page,/action:"scrap"|value="scrap"/);
 assert.match(css,/@media\(max-width:700px\)/);
});
