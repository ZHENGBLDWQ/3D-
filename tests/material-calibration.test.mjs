import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("calibration task migration is registered, scoped and tied to physical facts",async()=>{const [ensure,migration,schema]=await Promise.all([read("db/ensure-schema.ts"),read("drizzle/0042_material_calibration_tasks.sql"),read("db/schema.ts")]);assert.match(ensure,/migration0042/);assert.match(ensure,/id:42,sql:migration0042/);assert.match(migration,/CREATE TABLE `material_calibration_tasks`/);assert.match(migration,/UNIQUE \(`organization_id`,`print_session_id`,`spool_id`\)/);assert.match(migration,/MATERIAL_CALIBRATION_ORGANIZATION_MISMATCH/);for(const key of ["print_session_id","printer_id","spool_id","before_gross_grams","after_gross_grams","actual_consumed_grams"])assert.match(migration,new RegExp(key));assert.match(schema,/sqliteTable\("material_calibration_tasks"/)});

test("calibration API only offers terminal unsettled bound usage and enforces printer scope",async()=>{const api=await read("app/api/calibration/route.ts");assert.match(api,/requireApiAccess\(true,"inventory\.write"\)/);assert.match(api,/u\.settled_at IS NULL/);assert.match(api,/u\.measured_grams IS NULL/);assert.match(api,/JOIN material_spools s ON s\.id=u\.spool_id/);assert.match(api,/ps\.status IN \('completed','failed','cancelled'\)/);assert.match(api,/allowedPrinter\(context\.printerScope/);assert.match(api,/organization_id=\?/)});

test("completing field calibration allocates one spool total by slice purpose and never deducts stock",async()=>{const api=await read("app/api/calibration/route.ts");assert.match(api,/actual=before-after/);assert.match(api,/actual\*Number\(row\.estimatedGrams\)\/total/);assert.match(api,/actual-allocated/);assert.match(api,/estimate_source='scale'/);assert.match(api,/await db\.batch/);assert.match(api,/calibration\.task\.\$\{body\.action\}/);assert.doesNotMatch(api,/UPDATE material_spools SET remaining_net_grams/)});

test("calibration page explains whole-spool weighing and proportional purpose allocation",async()=>{const [page,client]=await Promise.all([read("app/calibration/page.tsx"),read("app/calibration/calibration-client.tsx")]);assert.match(page,/getAccessContext/);assert.match(client,/打印前整卷毛重/);assert.match(client,/打印后整卷毛重/);assert.match(client,/计算消耗/);assert.match(client,/不会编造设备测量值/);assert.match(client,/按切片中的用途比例分配/);assert.match(client,/确认并按比例回写证据/)});
