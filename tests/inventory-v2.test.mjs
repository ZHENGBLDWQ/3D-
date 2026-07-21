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
 assert.match(api,/\["sealed","open_storage"\]\.includes\(row\.state\)/);
 assert.doesNotMatch(api,/\["sealed","open_storage","needs_count"\]/);
 assert.match(api,/历史库存尚未完成实物盘点，不能领用/);
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

test("legacy aggregate placeholders are isolated from sealed inventory and issue choices",async()=>{
 const page=await read("app/inventory/inventory-v2-client.tsx");
 assert.match(page,/const sealed=useMemo\(\(\)=>data\?\.spools\.filter\(s=>s\.state==="sealed"\)/);
 assert.match(page,/legacy=useMemo\(\(\)=>data\?\.spools\.filter\(s=>s\.state==="needs_count"\)/);
 assert.match(page,/逐卷称重并登记真实卷码后才可领用/);
 assert.match(page,/const eligible=useMemo\(\(\)=>\[\.\.\.open,\.\.\.sealed\]/);assert.match(page,/eligible\.map/);
});

test("legacy stock can only become an issueable spool through an audited physical count",async()=>{
 const [api,page]=await Promise.all([read("app/api/inventory-v2/route.ts"),read("app/inventory/inventory-v2-client.tsx")]);
 assert.match(api,/action==="confirmLegacySpool"/);assert.match(api,/spool\.state!=="needs_count"/);
 assert.match(api,/inventory_v2\.legacy\.confirmed/);assert.match(api,/历史聚合库存实物盘点并转为实体卷/);
 assert.match(api,/INSERT INTO spool_weight_checks/);assert.match(api,/physicalState/);
 assert.match(page,/历史库存实物盘点/);assert.match(page,/盘点确认/);assert.match(page,/action:"confirmLegacySpool"/);
});

test("serialized spools expose offline labels and scanner-assisted issue selection",async()=>{
 const [page,label,css,pkg]=await Promise.all([read("app/inventory/inventory-v2-client.tsx"),read("app/inventory/spool-label.tsx"),read("app/inventory/spool-label.css"),read("package.json")]);
 assert.match(page,/扫码或输入实体卷码/);assert.match(page,/replace\(\/\^LT:SPOOL:\//);assert.match(page,/setIssueSpoolId/);
 assert.match(page,/打印标签/);assert.match(label,/import\("qrcode"\)/);assert.match(label,/`LT:SPOOL:\$\{spool\.spoolCode\}`/);
 assert.match(label,/不含任何设备密钥/);assert.match(css,/@media print/);assert.match(pkg,/"qrcode"/);
});

test("material catalog master data drives shared color and AMS metadata",async()=>{
 const [api,page,css]=await Promise.all([read("app/api/inventory-v2/route.ts"),read("app/inventory/inventory-v2-client.tsx"),read("app/inventory/material-catalog.css")]);
 assert.match(api,/action==="saveCatalog"/);assert.match(api,/inventory_v2\.catalog\.created/);assert.match(api,/inventory_v2\.catalog\.updated/);
 assert.match(api,/\^\[0-9A-F\]\{6\}\$/);assert.match(api,/organization_id=\?/);assert.match(api,/ams_compatibility/);
 for(const label of ["耗材目录与颜色主数据","新增耗材目录","官方色号","真实色值 HEX","AMS兼容性"]){assert.match(page,new RegExp(label),label)}
 assert.match(page,/tagText/);assert.match(css,/catalog-master-list/);
});

test("unbound Bambu feeds expose telemetry candidates without guessing a spool deduction",async()=>{
 const [api,page,css]=await Promise.all([read("app/api/inventory-v2/route.ts"),read("app/inventory/inventory-v2-client.tsx"),read("app/inventory/ams-matching.css")]);
 assert.match(api,/LEFT JOIN bambu_ams_slots/);assert.match(api,/a\.tag_uid/);assert.match(api,/a\.remaining_percent/);assert.match(api,/f\.toolhead='auxiliary' THEN 254 ELSE 255/);
 assert.match(page,/function slotSuggestion/);assert.match(page,/RFID已识别/);assert.match(page,/confidence:"高"/);assert.match(page,/置信度/);assert.match(page,/最终必须扫码确认/);
 assert.match(page,/openIssue\(slot\)/);assert.match(page,/issuePositionId/);assert.match(page,/仅供核对/);assert.match(css,/ams-detection-list/);
 assert.doesNotMatch(api,/UPDATE material_spools[\s\S]{0,250}bambu_ams_slots/);
});
