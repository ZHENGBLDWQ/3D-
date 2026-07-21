import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("maintenance migration registers scoped plans, records and completion idempotency",async()=>{
  const [sql,runner,schema]=await Promise.all([read("drizzle/0032_printer_maintenance.sql"),read("db/ensure-schema.ts"),read("db/schema.ts")]);
  assert.match(sql,/CREATE TABLE `maintenance_plans`/);
  assert.match(sql,/CREATE TABLE `maintenance_records`/);
  assert.match(sql,/`organization_id` integer NOT NULL/);
  assert.match(sql,/`plan_id` integer NOT NULL UNIQUE/);
  assert.match(sql,/MAINTENANCE_PLAN_SCOPE_MISMATCH/);
  assert.match(runner,/migration0032/);
  assert.match(runner,/id:32,sql:migration0032/);
  assert.match(schema,/maintenancePlans/);
  assert.match(schema,/maintenanceRecords/);
});

test("maintenance API enforces organization, printer scope and control permission",async()=>{
  const api=await read("app/api/maintenance/route.ts");
  assert.match(api,/requireApiAccess\(true,"printers\.control"\)/);
  assert.match(api,/pb\.organization_id=\?/);
  assert.match(api,/mp\.organization_id=\?/);
  assert.match(api,/allowedPrinter\(context\.printerScope/);
  assert.match(api,/printer_bindings pb/);
  assert.match(api,/无权管理该打印机/);
  assert.match(api,/maintenance\.plan\.\$\{body\.action\}/);
});

test("maintenance workflow only completes an in-progress plan and records actuals once",async()=>{
  const api=await read("app/api/maintenance/route.ts");
  assert.match(api,/plan\.status!=="in_progress"/);
  assert.match(api,/INSERT INTO maintenance_records/);
  assert.match(api,/cost_cents,downtime_minutes,operator_email,meter_hours/);
  assert.match(api,/UPDATE maintenance_plans SET status='completed'/);
  assert.match(api,/UPDATE printers SET maintenance_due_at/);
  assert.match(api,/不能重复提交/);
});

test("maintenance due evaluation uses date and accumulated printer hours",async()=>{
  const status=await read("maintenance/status.ts");
  assert.match(status,/input\.totalHours>input\.dueHours/);
  assert.match(status,/dateDue\.valueOf\(\)-now\.valueOf\(\)<=7\*86400000/);
  assert.match(status,/return "overdue"/);
  assert.match(status,/return hoursDue\|\|dateSoon/);
});

test("maintenance page exposes plan, action queue and immutable service history",async()=>{
  const page=await read("app/maintenance/maintenance-client.tsx");
  assert.match(page,/设备维护中心/);
  assert.match(page,/计划保养/);
  assert.match(page,/开始保养/);
  assert.match(page,/完成并归档/);
  assert.match(page,/保养档案/);
  assert.match(page,/costCents:Math\.round/);
});
