import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("inventory valuation is organization scoped and uses purchase-lot cents",async()=>{const data=await read("inventory-value/data.ts");assert.ok((data.match(/organization_id=\?/g)||[]).length>=5);assert.match(data,/remaining_net_grams\*COALESCE\(l\.unit_cost_cents_per_kg,0\)\/1000\.0/);assert.match(data,/Promise\.all/);assert.match(data,/unknownCostSpools/)});
test("active feed bindings take precedence over storage state",async()=>{const data=await read("inventory-value/data.ts");assert.match(data,/EXISTS\(SELECT 1 FROM spool_bindings/);assert.match(data,/THEN 'in_use'/);assert.match(data,/WHEN s\.state='sealed' THEN 'sealed'/)});
test("valuation joins reconciliation and immutable settlement facts",async()=>{const data=await read("inventory-value/data.ts");for(const fact of ["supplier_invoices","material_cost_adjustments","print_material_usage_lines","settled_at IS NOT NULL","skipped_settled"])assert.match(data,new RegExp(fact))});
test("inventory value page explains cost layers and data quality",async()=>{const page=await read("app/inventory-value/page.tsx");for(const label of ["库存价值与成本分析","未拆封库存","打印机使用中","采购实际价差","成本数据完整性","采购批次成本层","冲刷／屎料"])assert.ok(page.includes(label))});
