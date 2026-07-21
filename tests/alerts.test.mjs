import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(`../${path}`,import.meta.url),"utf8");

test("alert persistence is organization scoped and signal fingerprints are idempotent",async()=>{const migration=await read("drizzle/0033_persistent_alert_center.sql"),signals=await read("alerts/signals.ts");assert.match(migration,/UNIQUE \(`organization_id`,`fingerprint`\)/);assert.match(migration,/alert_actions_org_alert_created_idx/);assert.match(signals,/printer_bindings pb/);assert.match(signals,/pb\.organization_id=\?/);assert.match(signals,/WHERE organization_id=\? AND fingerprint=\?/);assert.match(signals,/signal_active=0/);assert.match(signals,/occurrence_count=occurrence_count\+1/)});

test("alert lifecycle is guarded, audited, and cannot access another organization",async()=>{const api=await read("app/api/alerts/route.ts");for(const action of ["acknowledge","assign","resolve","reopen"])assert.match(api,new RegExp(`\\"${action}\\"`));assert.match(api,/WHERE id=\? AND organization_id=\?/);assert.match(api,/organization_members WHERE organization_id=\?/);assert.match(api,/alert_actions\(organization_id/);assert.match(api,/recordAudit\(context,`alert\.\$\{action\}`/);assert.match(api,/printers\.control/);assert.match(api,/:"write"/)});

test("alerts page exposes current work, ownership, resolution and operation history",async()=>{const page=await read("app/alerts/alert-center.tsx");assert.match(page,/同步当前信号/);assert.match(page,/指派负责人/);assert.match(page,/最近操作/);assert.match(page,/重开/)});
